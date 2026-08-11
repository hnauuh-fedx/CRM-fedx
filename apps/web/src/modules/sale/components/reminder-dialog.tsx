import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api";
import { createSaleReminder, updateSaleReminder } from "@/services/sale.service";
import type { LeadRef, ReminderItem } from "../sale.types";

const reminderSchema = z.object({
  leadId: z.string().min(1, "Vui lòng chọn lead."),
  title: z.string().trim().min(2, "Vui lòng nhập tiêu đề nhắc việc.").max(255, "Tiêu đề tối đa 255 ký tự."),
  content: z.string().trim().max(4000, "Nội dung tối đa 4.000 ký tự."),
  remindAt: z.string().min(1, "Vui lòng chọn thời hạn."),
});
type ReminderForm = z.infer<typeof reminderSchema>;

function toDateTimeLocal(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function ReminderDialog({ reminder, leads, accessToken }: { reminder?: ReminderItem; leads: LeadRef[]; accessToken: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEditing = Boolean(reminder);
  const defaultValues = {
    leadId: reminder?.lead?.id ?? "",
    title: reminder?.title ?? "",
    content: reminder?.content ?? "",
    remindAt: toDateTimeLocal(reminder?.remindAt),
  };
  const form = useForm<ReminderForm>({ defaultValues });
  const mutation = useMutation({
    mutationFn: (values: ReminderForm) => {
      const input = { title: values.title, content: values.content || undefined, remindAt: new Date(values.remindAt).toISOString() };
      return reminder ? updateSaleReminder(reminder.id, input, accessToken) : createSaleReminder({ leadId: values.leadId, ...input }, accessToken);
    },
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sale", "reminders"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
  const fieldPrefix = reminder ? `reminder-${reminder.id}` : "reminder-new";
  const availableLeads = reminder?.lead && !leads.some((lead) => lead.id === reminder.lead?.id) ? [reminder.lead, ...leads] : leads;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { mutation.reset(); form.reset(defaultValues); } }}>
      <DialogTrigger asChild>
        <Button type="button" variant={isEditing ? "ghost" : "default"} size={isEditing ? "sm" : "default"}>
          {isEditing ? <Pencil data-icon="inline-start" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}
          {isEditing ? "Sửa" : "Tạo nhắc việc"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Sửa nhắc việc" : "Tạo nhắc việc"}</DialogTitle>
          <DialogDescription>Nhắc việc được liên kết với lead và ghi nhận vào timeline chăm sóc.</DialogDescription>
        </DialogHeader>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof ApiError ? mutation.error.message : "Không thể lưu thay đổi. Vui lòng thử lại."}</p>}
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit((values) => {
          const parsed = reminderSchema.safeParse(values);
          if (!parsed.success) {
            parsed.error.issues.forEach((issue) => form.setError(issue.path[0] as keyof ReminderForm, { message: issue.message }));
            return;
          }
          mutation.mutate(parsed.data);
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
            <Field data-invalid={Boolean(form.formState.errors.title)}>
              <FieldLabel htmlFor={`${fieldPrefix}-title`}>Tiêu đề *</FieldLabel>
              <Input id={`${fieldPrefix}-title`} aria-invalid={Boolean(form.formState.errors.title)} {...form.register("title")} />
              <FieldError errors={[form.formState.errors.title]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.remindAt)}>
              <FieldLabel htmlFor={`${fieldPrefix}-time`}>Thời hạn *</FieldLabel>
              <Input id={`${fieldPrefix}-time`} type="datetime-local" aria-invalid={Boolean(form.formState.errors.remindAt)} {...form.register("remindAt")} />
              <FieldError errors={[form.formState.errors.remindAt]} />
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.content)}>
              <FieldLabel htmlFor={`${fieldPrefix}-content`}>Nội dung</FieldLabel>
              <Textarea id={`${fieldPrefix}-content`} rows={3} aria-invalid={Boolean(form.formState.errors.content)} {...form.register("content")} />
              <FieldError errors={[form.formState.errors.content]} />
            </Field>
          </FieldGroup>
          <Button className="self-end" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu nhắc việc"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
