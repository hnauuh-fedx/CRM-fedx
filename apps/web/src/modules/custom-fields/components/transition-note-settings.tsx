import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import type { TransitionNoteConfiguration, TransitionNoteTemplate } from "@/modules/leads/transition-note.types";
import { getTransitionNoteConfiguration, setTransitionNoteTemplates } from "@/services/custom-field.service";

const templatesSchema = z.object({ templates: z.array(z.object({
  id: z.uuid(),
  content: z.string().trim().min(1, "Vui lòng nhập nội dung ghi chú.").max(1800, "Nội dung tối đa 1.800 ký tự."),
  isActive: z.boolean(),
})).max(100, "Mỗi trạng thái có tối đa 100 mẫu ghi chú.") });

export function TransitionNoteSettings() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("FAIL");
  const [hasDraft, setHasDraft] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: ["transition-note-configuration"],
    queryFn: () => getTransitionNoteConfiguration(auth.accessToken!),
    enabled: open && Boolean(auth.accessToken),
  });
  const configuration = query.data?.find((item) => item.target === target);
  const canEdit = auth.can("custom_field.update") && auth.can("custom_field.manage_options");

  return <Dialog open={open} onOpenChange={(value) => {
    if (isSaving) return;
    setOpen(value);
    if (!value) { setHasDraft(false); setSaved(false); }
  }}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">Cấu hình ghi chú theo trạng thái</Button></DialogTrigger>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-2xl" showCloseButton={!isSaving}>
      <DialogHeader className="pr-6">
        <DialogTitle>Ghi chú có sẵn theo tiến trình / Fail</DialogTitle>
        <DialogDescription>Cấu hình dùng chung toàn hệ thống. Popup chỉ hiển thị mẫu đang dùng của trạng thái đích; nhân viên có thể bỏ qua ghi chú.</DialogDescription>
      </DialogHeader>
      {query.isPending ? <p role="status">Đang tải cấu hình ghi chú…</p> : query.isError ? <Alert variant="destructive"><AlertTitle>Không thể tải cấu hình</AlertTitle><AlertDescription><Button variant="outline" onClick={() => query.refetch()}>Thử lại</Button></AlertDescription></Alert> : <>
        <Field data-disabled={hasDraft || isSaving}>
          <FieldLabel htmlFor="transition-note-target">Tiến trình hoặc trạng thái</FieldLabel>
          <Select value={target} onValueChange={(value) => { setTarget(value); setSaved(false); }} disabled={hasDraft || isSaving}>
            <SelectTrigger id="transition-note-target" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{query.data?.map((item) => <SelectItem key={item.target} value={item.target}>{item.label}{item.pipelineName ? ` · ${item.pipelineName}` : ""}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {hasDraft && <FieldDescription>Lưu hoặc hủy thay đổi trước khi chuyển sang trạng thái khác.</FieldDescription>}
        </Field>
        {saved && <p role="status" className="text-sm text-muted-foreground">Đã lưu cấu hình ghi chú.</p>}
        {configuration && <TransitionNoteTemplateForm key={target} configuration={configuration} accessToken={auth.accessToken!} canEdit={canEdit} onDraftChange={setHasDraft} onSavingChange={setIsSaving} onSaved={() => setSaved(true)} />}
      </>}
    </DialogContent>
  </Dialog>;
}

function TransitionNoteTemplateForm({ configuration, accessToken, canEdit, onDraftChange, onSavingChange, onSaved }: {
  configuration: TransitionNoteConfiguration;
  accessToken: string;
  canEdit: boolean;
  onDraftChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<{ templates: TransitionNoteTemplate[] }>({ defaultValues: { templates: configuration.templates } });
  const array = useFieldArray({ control: form.control, name: "templates", keyName: "rowId" });
  const mutation = useMutation({
    mutationFn: (templates: TransitionNoteTemplate[]) => setTransitionNoteTemplates(configuration.target, templates, accessToken),
    onSuccess: async (templates) => {
      form.reset({ templates });
      onDraftChange(false);
      await queryClient.invalidateQueries({ queryKey: ["transition-note-configuration"] });
      onSaved();
    },
    onSettled: () => onSavingChange(false),
  });
  const disabled = !canEdit || mutation.isPending;
  function markDirty() { onDraftChange(true); mutation.reset(); }

  return <form className="flex min-h-0 flex-col gap-4" onSubmit={form.handleSubmit((values) => {
    if (!canEdit || mutation.isPending) return;
    const parsed = templatesSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => form.setError(issue.path.join(".") as `templates.${number}.content`, { message: issue.message }));
      return;
    }
    onSavingChange(true);
    mutation.mutate(parsed.data.templates);
  })}>
    {mutation.isError && <Alert variant="destructive"><AlertTitle>Không thể lưu cấu hình</AlertTitle><AlertDescription>{mutation.error.message}</AlertDescription></Alert>}
    <FieldGroup className="min-h-0 overflow-y-auto p-1">
      {array.fields.length === 0 && <p className="text-sm text-muted-foreground">Chưa có mẫu ghi chú. Khi chuyển sang trạng thái này, hệ thống sẽ không mở popup ghi chú.</p>}
      {array.fields.map((item, index) => <FieldGroup key={item.rowId} className="gap-3 rounded-md border p-3">
        <Field data-invalid={Boolean(form.formState.errors.templates?.[index]?.content)} data-disabled={disabled}>
          <FieldLabel htmlFor={`transition-note-content-${item.rowId}`}>Ghi chú {index + 1}</FieldLabel>
          <Textarea id={`transition-note-content-${item.rowId}`} rows={2} maxLength={1800} disabled={disabled} aria-invalid={Boolean(form.formState.errors.templates?.[index]?.content)} {...form.register(`templates.${index}.content`, { onChange: markDirty })} />
          <FieldError errors={[form.formState.errors.templates?.[index]?.content]} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Field orientation="horizontal" data-disabled={disabled}>
            <Checkbox id={`transition-note-active-${item.rowId}`} checked={form.watch(`templates.${index}.isActive`)} disabled={disabled} onCheckedChange={(checked) => { form.setValue(`templates.${index}.isActive`, checked === true, { shouldDirty: true }); markDirty(); }} />
            <FieldLabel htmlFor={`transition-note-active-${item.rowId}`}>Đang dùng</FieldLabel>
          </Field>
          {canEdit && <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon-sm" aria-label={`Đưa ghi chú ${index + 1} lên trên`} disabled={disabled || index === 0} onClick={() => { array.move(index, index - 1); markDirty(); }}><ArrowUp /></Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label={`Đưa ghi chú ${index + 1} xuống dưới`} disabled={disabled || index === array.fields.length - 1} onClick={() => { array.move(index, index + 1); markDirty(); }}><ArrowDown /></Button>
            <Button type="button" variant="destructive" size="icon-sm" aria-label={`Xóa mẫu ghi chú ${index + 1}`} disabled={disabled} onClick={() => { array.remove(index); markDirty(); }}><Trash2 /></Button>
          </div>}
        </div>
      </FieldGroup>)}
    </FieldGroup>
    <FieldError errors={[form.formState.errors.templates]} />
    {canEdit && <Button type="button" variant="outline" className="self-start" disabled={disabled || array.fields.length >= 100} onClick={() => { array.append({ id: crypto.randomUUID(), content: "", isActive: true }); markDirty(); }}><Plus data-icon="inline-start" />Thêm mẫu ghi chú</Button>}
    <DialogFooter>
      {canEdit ? <>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { form.reset({ templates: configuration.templates }); onDraftChange(false); mutation.reset(); }}>Hủy thay đổi</Button>
        <Button type="submit" disabled={disabled || !form.formState.isDirty}>{mutation.isPending ? "Đang lưu…" : "Lưu cấu hình"}</Button>
      </> : <p className="text-sm text-muted-foreground">Bạn cần quyền cập nhật trường và quản lý lựa chọn để sửa mẫu ghi chú.</p>}
    </DialogFooter>
  </form>;
}
