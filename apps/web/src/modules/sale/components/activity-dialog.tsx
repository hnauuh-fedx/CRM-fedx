import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/services/api";
import { createLeadActivity, updateLeadActivity } from "@/services/sale.service";
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

export function ActivityDialog({ activity, leads, accessToken }: { activity?: ActivityItem; leads: LeadRef[]; accessToken: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEditing = Boolean(activity);
  const defaultValues = { leadId: activity?.lead?.id ?? "", type: activity?.type ?? "call", content: activity?.content ?? "" };
  const form = useForm<ActivityForm>({ defaultValues });
  const mutation = useMutation({
    mutationFn: (values: ActivityForm) => activity
      ? updateLeadActivity(activity.id, { type: values.type, content: values.content }, accessToken)
      : createLeadActivity(values, accessToken),
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
          </FieldGroup>
          <Button className="self-end" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu hoạt động"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
