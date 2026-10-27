import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { SaleCustomFieldInputs } from "./sale-custom-field-inputs";
import { SaleLeadField } from "./sale-lead-field";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  LeadCustomField,
  LeadCustomFieldValue,
} from "@/modules/leads/lead.types";
import { ApiError } from "@/services/api";
import {
  createSaleReminder,
  getSaleReminderCustomFieldDefinitions,
  getSaleReminderCustomFields,
  updateSaleReminder,
} from "@/services/sale.service";
import type { LeadRef, ReminderItem } from "../sale.types";

const reminderSchema = z.object({
  leadId: z.string().min(1, "Vui lòng chọn lead."),
  title: z
    .string()
    .trim()
    .min(2, "Vui lòng nhập tiêu đề nhắc việc.")
    .max(255, "Tiêu đề tối đa 255 ký tự."),
  content: z.string().trim().max(4000, "Nội dung tối đa 4.000 ký tự."),
  remindAt: z.string().min(1, "Vui lòng chọn thời hạn."),
});
type ReminderForm = z.infer<typeof reminderSchema>;
type ReminderFormValues = ReminderForm & {
  customFieldValues: Record<string, LeadCustomFieldValue>;
};

function toDateTimeLocal(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offsetDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return offsetDate.toISOString().slice(0, 16);
}

export function ReminderDialog({
  reminder,
  leads,
  accessToken,
}: {
  reminder?: ReminderItem;
  leads: LeadRef[];
  accessToken: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEditing = Boolean(reminder);
  const defaultValues = useMemo(
    () => ({
      leadId: reminder?.lead?.id ?? "",
      title: reminder?.title ?? "",
      content: reminder?.content ?? "",
      remindAt: toDateTimeLocal(reminder?.remindAt),
      customFieldValues: {},
    }),
    [reminder],
  );
  const form = useForm<ReminderFormValues>({ defaultValues });
  const selectedLeadId = form.watch("leadId");
  const customFieldsQuery = useQuery({
    queryKey: [
      "sale",
      "reminders",
      "custom-fields",
      reminder?.id ?? "new",
      selectedLeadId,
    ],
    queryFn: () =>
      reminder
        ? getSaleReminderCustomFields(reminder.id, accessToken)
        : getSaleReminderCustomFieldDefinitions(
            selectedLeadId || undefined,
            accessToken,
          ),
    enabled: open && Boolean(accessToken),
  });
  const customFields = useMemo(
    () => customFieldsQuery.data?.fields ?? [],
    [customFieldsQuery.data?.fields],
  );
  const customFieldsByGroup = useMemo(
    () => groupCustomFields(customFields),
    [customFields],
  );
  useEffect(() => {
    for (const field of customFields) {
      const path = `customFieldValues.${field.id}` as const;
      if (field.canView && !form.getFieldState(path).isDirty)
        form.setValue(
          path,
          reminder ? field.value : (field.value ?? field.defaultValue ?? null),
        );
    }
  }, [customFields, form, reminder]);
  const mutation = useMutation({
    mutationFn: (values: ReminderFormValues) => {
      const input = {
        title: values.title,
        content: values.content || undefined,
        remindAt: new Date(values.remindAt).toISOString(),
        customFieldValues: values.customFieldValues,
      };
      return reminder
        ? updateSaleReminder(reminder.id, input, accessToken)
        : createSaleReminder({ leadId: values.leadId, ...input }, accessToken);
    },
    onSuccess: (result) => {
      if (!result.overlapWarning) setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sale", "reminders"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
  const fieldPrefix = reminder ? `reminder-${reminder.id}` : "reminder-new";
  const availableLeads =
    reminder?.lead && !leads.some((lead) => lead.id === reminder.lead?.id)
      ? [reminder.lead, ...leads]
      : leads;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          mutation.reset();
          form.reset(defaultValues);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={isEditing ? "ghost" : "default"}
          size={isEditing ? "sm" : "default"}
        >
          {isEditing ? (
            <Pencil data-icon="inline-start" aria-hidden="true" />
          ) : (
            <Plus data-icon="inline-start" aria-hidden="true" />
          )}
          {isEditing ? "Sửa" : "Tạo nhắc việc"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Sửa nhắc việc" : "Tạo nhắc việc"}
          </DialogTitle>
          <DialogDescription>
            Nhắc việc được liên kết với lead và ghi nhận vào timeline chăm sóc.
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Không thể lưu thay đổi. Vui lòng thử lại."}
          </p>
        )}
        <form
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit((values) => {
            const parsed = reminderSchema.safeParse(values);
            if (!parsed.success) {
              parsed.error.issues.forEach((issue) =>
                form.setError(issue.path[0] as keyof ReminderForm, {
                  message: issue.message,
                }),
              );
              return;
            }
            mutation.mutate({
              ...parsed.data,
              customFieldValues: collectCustomFieldValues(
                customFields,
                values,
                isEditing,
                form,
              ),
            });
          })}
        >
          <FieldGroup className="gap-4">
            <SaleLeadField
              id={`${fieldPrefix}-lead`}
              value={form.watch("leadId")}
              onChange={(value) =>
                form.setValue("leadId", value, { shouldValidate: true })
              }
              leads={availableLeads}
              disabled={isEditing}
              error={form.formState.errors.leadId}
            />
            <Field data-invalid={Boolean(form.formState.errors.title)}>
              <FieldLabel htmlFor={`${fieldPrefix}-title`}>
                Tiêu đề *
              </FieldLabel>
              <Input
                id={`${fieldPrefix}-title`}
                aria-invalid={Boolean(form.formState.errors.title)}
                {...form.register("title")}
              />
              <FieldError errors={[form.formState.errors.title]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.remindAt)}>
              <FieldLabel htmlFor={`${fieldPrefix}-time`}>
                Thời hạn *
              </FieldLabel>
              <Input
                id={`${fieldPrefix}-time`}
                type="datetime-local"
                aria-invalid={Boolean(form.formState.errors.remindAt)}
                {...form.register("remindAt")}
              />
              <FieldError errors={[form.formState.errors.remindAt]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.content)}>
              <FieldLabel htmlFor={`${fieldPrefix}-content`}>
                Nội dung
              </FieldLabel>
              <Textarea
                id={`${fieldPrefix}-content`}
                rows={3}
                aria-invalid={Boolean(form.formState.errors.content)}
                {...form.register("content")}
              />
              <FieldError errors={[form.formState.errors.content]} />
            </Field>
            <SaleCustomFieldInputs
              fieldsByGroup={customFieldsByGroup}
              control={form.control}
              isPending={mutation.isPending}
              isLoading={customFieldsQuery.isLoading}
              isError={customFieldsQuery.isError}
              emptyLabel="Chưa có trường dữ liệu bổ sung áp dụng."
            />
          </FieldGroup>
          <Button
            className="self-end"
            type="submit"
            disabled={mutation.isPending || Boolean(mutation.data?.overlapWarning)}
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu nhắc việc"}
          </Button>
          {mutation.data?.overlapWarning && <Alert><AlertTitle>Nhắc việc trùng thời điểm</AlertTitle><AlertDescription>{mutation.data.overlapWarning}<Button type="button" variant="outline" onClick={() => setOpen(false)}>Đã hiểu</Button></AlertDescription></Alert>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function groupCustomFields(fields: LeadCustomField[]) {
  const groups = new Map<string, LeadCustomField[]>();
  for (const field of fields)
    groups.set(field.group.id, [...(groups.get(field.group.id) ?? []), field]);
  return [...groups.values()].sort(
    (left, right) =>
      (left[0]?.group.displayOrder ?? 0) - (right[0]?.group.displayOrder ?? 0),
  );
}

function collectCustomFieldValues(
  fields: LeadCustomField[],
  values: ReminderFormValues,
  isEditing: boolean,
  form: {
    getFieldState: (name: `customFieldValues.${string}`) => {
      isDirty: boolean;
    };
  },
) {
  const customFieldValues: Record<string, LeadCustomFieldValue> = {};
  for (const field of fields) {
    if (!field.canView || !field.canEdit) continue;
    if (
      !isEditing ||
      form.getFieldState(`customFieldValues.${field.id}`).isDirty
    )
      customFieldValues[field.id] = values.customFieldValues[field.id] ?? null;
  }
  return customFieldValues;
}
