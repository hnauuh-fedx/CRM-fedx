import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type Control } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api";
import { createLeadActivity, getSaleActivityCustomFieldDefinitions, getSaleActivityCustomFields, updateLeadActivity } from "@/services/sale.service";
import { DynamicFieldRenderer } from "@/modules/leads/components/dynamic-field-renderer";
import type { LeadCustomField, LeadCustomFieldValue } from "@/modules/leads/lead.types";
import type { ActivityItem, LeadRef } from "../sale.types";

const activitySchema = z.object({
  leadId: z.string().min(1, "Vui lòng chọn lead."),
  type: z.string().min(1, "Vui lòng chọn loại hoạt động."),
  content: z.string().trim().min(1, "Vui lòng nhập nội dung hoạt động.").max(4000, "Nội dung tối đa 4.000 ký tự."),
});
const activityTypes = [
  { value: "call", label: "Cuộc gọi" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Cuộc hẹn" },
  { value: "consultation", label: "Tư vấn" },
  { value: "follow_up", label: "Theo dõi tiếp" },
  { value: "other", label: "Khác" },
];
type ActivityForm = z.infer<typeof activitySchema>;
type ActivityFormValues = ActivityForm & { customFieldValues: Record<string, LeadCustomFieldValue> };

export function ActivityDialog({ activity, leads, accessToken }: { activity?: ActivityItem; leads: LeadRef[]; accessToken: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEditing = Boolean(activity);
  const defaultValues = useMemo(() => ({ leadId: activity?.lead?.id ?? "", type: activity?.type ?? "call", content: activity?.content ?? "", customFieldValues: {} }), [activity]);
  const form = useForm<ActivityFormValues>({ defaultValues });
  const selectedLeadId = form.watch("leadId");
  const customFieldsQuery = useQuery({
    queryKey: ["sale", "activities", "custom-fields", activity?.id ?? "new", selectedLeadId],
    queryFn: () => activity ? getSaleActivityCustomFields(activity.id, accessToken) : getSaleActivityCustomFieldDefinitions(selectedLeadId || undefined, accessToken),
    enabled: open && Boolean(accessToken),
  });
  const customFields = useMemo(() => customFieldsQuery.data?.fields ?? [], [customFieldsQuery.data?.fields]);
  const customFieldsByGroup = useMemo(() => groupCustomFields(customFields), [customFields]);
  useEffect(() => {
    for (const field of customFields) {
      const path = `customFieldValues.${field.id}` as const;
      if (field.canView && !form.getFieldState(path).isDirty) form.setValue(path, activity ? field.value : field.value ?? field.defaultValue ?? null);
    }
  }, [activity, customFields, form]);
  const mutation = useMutation({
    mutationFn: (values: ActivityFormValues) => activity
      ? updateLeadActivity(activity.id, { type: values.type, content: values.content, customFieldValues: values.customFieldValues }, accessToken)
      : createLeadActivity({ leadId: values.leadId, type: values.type, content: values.content, customFieldValues: values.customFieldValues }, accessToken),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sale", "activities"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
  const fieldPrefix = activity ? `activity-${activity.id}` : "activity-new";
  const availableLeads = activity?.lead && !leads.some((lead) => lead.id === activity.lead?.id) ? [activity.lead, ...leads] : leads;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { mutation.reset(); form.reset(defaultValues); } }}>
      <DialogTrigger asChild>
        <Button type="button" variant={isEditing ? "ghost" : "default"} size={isEditing ? "sm" : "default"}>
          {isEditing ? <Pencil data-icon="inline-start" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}
          {isEditing ? "Sửa" : "Tạo hoạt động"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Sửa hoạt động sale" : "Tạo hoạt động sale"}</DialogTitle>
          <DialogDescription>Hoạt động được lưu vào timeline chăm sóc của lead.</DialogDescription>
        </DialogHeader>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof ApiError ? mutation.error.message : "Không thể lưu thay đổi. Vui lòng thử lại."}</p>}
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit((values) => {
          const parsed = activitySchema.safeParse(values);
          if (!parsed.success) {
            parsed.error.issues.forEach((issue) => form.setError(issue.path[0] as keyof ActivityForm, { message: issue.message }));
            return;
          }
          mutation.mutate({ ...parsed.data, customFieldValues: collectCustomFieldValues(customFields, values, isEditing, form) });
        })}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(form.formState.errors.leadId)}>
              <FieldLabel htmlFor={`${fieldPrefix}-lead`}>Lead *</FieldLabel>
              <Select disabled={isEditing} value={form.watch("leadId")} onValueChange={(value) => form.setValue("leadId", value, { shouldValidate: true })}>
                <SelectTrigger id={`${fieldPrefix}-lead`} className="w-full" aria-invalid={Boolean(form.formState.errors.leadId)}><SelectValue placeholder="Chọn lead" /></SelectTrigger>
                <SelectContent><SelectGroup>{availableLeads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.fullName}{lead.leadCode ? ` (${lead.leadCode})` : ""}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <FieldError errors={[form.formState.errors.leadId]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.type)}>
              <FieldLabel htmlFor={`${fieldPrefix}-type`}>Loại hoạt động *</FieldLabel>
              <Select value={form.watch("type")} onValueChange={(value) => form.setValue("type", value, { shouldValidate: true })}>
                <SelectTrigger id={`${fieldPrefix}-type`} className="w-full" aria-invalid={Boolean(form.formState.errors.type)}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{activityTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <FieldError errors={[form.formState.errors.type]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.content)}>
              <FieldLabel htmlFor={`${fieldPrefix}-content`}>Nội dung *</FieldLabel>
              <Textarea id={`${fieldPrefix}-content`} rows={4} aria-invalid={Boolean(form.formState.errors.content)} {...form.register("content")} />
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
          <Button className="self-end" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu hoạt động"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function groupCustomFields(fields: LeadCustomField[]) {
  const groups = new Map<string, LeadCustomField[]>();
  for (const field of fields) groups.set(field.group.id, [...(groups.get(field.group.id) ?? []), field]);
  return [...groups.values()].sort((left, right) => (left[0]?.group.displayOrder ?? 0) - (right[0]?.group.displayOrder ?? 0));
}

function collectCustomFieldValues(
  fields: LeadCustomField[],
  values: ActivityFormValues,
  isEditing: boolean,
  form: { getFieldState: (name: `customFieldValues.${string}`) => { isDirty: boolean } },
) {
  const customFieldValues: Record<string, LeadCustomFieldValue> = {};
  for (const field of fields) {
    if (!field.canView || !field.canEdit) continue;
    if (!isEditing || form.getFieldState(`customFieldValues.${field.id}`).isDirty) customFieldValues[field.id] = values.customFieldValues[field.id] ?? null;
  }
  return customFieldValues;
}

function SaleCustomFieldInputs({
  fieldsByGroup,
  control,
  isPending,
  isLoading,
  isError,
  emptyLabel,
}: {
  fieldsByGroup: LeadCustomField[][];
  control: Control<ActivityFormValues>;
  isPending: boolean;
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
}) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải trường dữ liệu bổ sung...</p>;
  if (isError) return <p role="alert" className="text-sm text-destructive">Không thể tải trường dữ liệu bổ sung. Vui lòng thử lại.</p>;
  if (fieldsByGroup.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  const inlineFields = fieldsByGroup.filter((fields) => fields[0]?.group.key === "basic").flat();
  const groupedFields = fieldsByGroup.filter((fields) => fields[0]?.group.key !== "basic");
  return (
    <>
      {inlineFields.map((field) => field.canView
        ? <DynamicFieldRenderer key={field.id} field={field} control={control} name={`customFieldValues.${field.id}`} disabled={isPending} />
        : <div key={field.id}><p className="text-sm text-muted-foreground">{field.name}</p><p className="text-sm font-medium">Không có quyền xem</p></div>)}
      {groupedFields.length > 0 && <div className="flex flex-col gap-4 rounded-md border border-border/70 bg-muted/10 p-3">
      {groupedFields.map((fields) => (
        <div key={fields[0]?.group.id} className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">{fields[0]?.group.label}</p>
            {fields[0]?.group.description && <p className="text-xs text-muted-foreground">{fields[0].group.description}</p>}
          </div>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => field.canView
              ? <DynamicFieldRenderer key={field.id} field={field} control={control} name={`customFieldValues.${field.id}`} disabled={isPending} />
              : <div key={field.id}><p className="text-sm text-muted-foreground">{field.name}</p><p className="text-sm font-medium">Không có quyền xem</p></div>)}
          </FieldGroup>
        </div>
      ))}
      </div>}
    </>
  );
}
