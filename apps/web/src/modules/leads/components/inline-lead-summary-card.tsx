import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import { updateLead } from "@/services/lead.service";
import { toLeadFormOptions, toLeadFormValues } from "../lead-form.helpers";
import type { LeadActionOptions, LeadDetail, LeadFormInput } from "../lead.types";

type EditableField =
  | "fullName"
  | "phone"
  | "email"
  | "dateOfBirth"
  | "currentAddress"
  | "sourceId"
  | "assigneeId"
  | "temperature"
  | "majorId"
  | "note";

type FieldErrors = Partial<Record<EditableField, string>>;

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "-";
}

function validateDraft(values: LeadFormInput): FieldErrors {
  const errors: FieldErrors = {};
  if (values.fullName.trim().length < 2) errors.fullName = "Vui lòng nhập họ và tên ứng viên.";
  if (!/^\d{10}$/.test(values.phone.trim())) errors.phone = "Số điện thoại phải gồm đúng 10 chữ số.";
  if (!values.sourceId) errors.sourceId = "Vui lòng chọn nguồn học viên.";
  if (values.email && !/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "Email không hợp lệ.";
  return errors;
}

function ReadonlyValue({
  label,
  value,
  editable = false,
  onEdit,
}: {
  label: string;
  value: string;
  editable?: boolean;
  onEdit?: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editable && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onEdit?.();
    }
  };

  return (
    <div
      className={editable ? "cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" : undefined}
      onDoubleClick={editable ? onEdit : undefined}
      onKeyDown={editable ? handleKeyDown : undefined}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? `Nhấp đúp để chỉnh sửa ${label.toLocaleLowerCase("vi-VN")}` : undefined}
      aria-label={editable ? `${label}: ${value}. Nhấn Enter hoặc nhấp đúp để chỉnh sửa.` : undefined}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function InlineField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Field>
  );
}

export function InlineLeadSummaryCard({
  lead,
  options,
  canUpdate,
}: {
  lead: LeadDetail;
  options?: LeadActionOptions;
  canUpdate: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canAssign = auth.can("lead.assign") || auth.can("lead.reassign");
  const editOptions = useMemo(() => toLeadFormOptions(lead, options), [lead, options]);
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editingFields, setEditingFields] = useState<Set<EditableField>>(() => new Set());
  const [lastOpenedField, setLastOpenedField] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState<LeadFormInput>(() => toLeadFormValues(lead));
  const [errors, setErrors] = useState<FieldErrors>({});
  const hasActiveEdits = isEditingAll || editingFields.size > 0;

  useEffect(() => {
    if (!hasActiveEdits) setDraft(toLeadFormValues(lead));
  }, [hasActiveEdits, lead]);

  const mutation = useMutation({
    mutationFn: (input: LeadFormInput) => updateLead(lead.id, input, auth.accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["sale"] });
      setIsEditingAll(false);
      setEditingFields(new Set());
      setLastOpenedField(null);
      setErrors({});
    },
  });

  const startEditingAll = () => {
    mutation.reset();
    setDraft(toLeadFormValues(lead));
    setErrors({});
    setEditingFields(new Set());
    setLastOpenedField(null);
    setIsEditingAll(true);
  };

  const startEditingField = (field: EditableField) => {
    if (!hasActiveEdits) {
      mutation.reset();
      setDraft(toLeadFormValues(lead));
      setErrors({});
    }
    setEditingFields((current) => {
      const next = new Set(current);
      next.add(field);
      return next;
    });
    setLastOpenedField(field);
  };

  const cancelEditing = () => {
    if (mutation.isPending) return;
    setDraft(toLeadFormValues(lead));
    setErrors({});
    mutation.reset();
    setIsEditingAll(false);
    setEditingFields(new Set());
    setLastOpenedField(null);
  };

  const save = () => {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate(draft);
  };

  const isEditing = (field: EditableField) => isEditingAll || editingFields.has(field);
  const update = <K extends keyof LeadFormInput>(field: K, value: LeadFormInput[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const editableValue = (field: EditableField, label: string, value: string) => (
    <ReadonlyValue label={label} value={value} editable={canUpdate} onEdit={() => startEditingField(field)} />
  );

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Thông tin cơ bản</CardTitle>
          <CardDescription>Thông tin liên hệ và nghiệp vụ hiện tại.</CardDescription>
        </div>
        {canUpdate && (hasActiveEdits ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" onClick={save} disabled={mutation.isPending}>
              {mutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={cancelEditing} disabled={mutation.isPending}>
              Hủy
            </Button>
          </div>
        ) : (
          <Button type="button" size="icon-sm" onClick={startEditingAll} aria-label="Chỉnh sửa thông tin cơ bản">
            <Pencil aria-hidden="true" />
          </Button>
        ))}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error instanceof ApiError ? mutation.error.message : "Không thể lưu thông tin. Vui lòng thử lại."}
          </p>
        )}
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {isEditing("fullName") ? (
            <InlineField id="inline-lead-full-name" label="Họ và tên" error={errors.fullName}>
              <Input id="inline-lead-full-name" value={draft.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" aria-invalid={Boolean(errors.fullName)} autoFocus={lastOpenedField === "fullName"} />
            </InlineField>
          ) : editableValue("fullName", "Họ và tên", lead.fullName)}

          {isEditing("phone") ? (
            <InlineField id="inline-lead-phone" label="Số điện thoại" error={errors.phone}>
              <Input id="inline-lead-phone" type="tel" inputMode="numeric" value={draft.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" aria-invalid={Boolean(errors.phone)} autoFocus={lastOpenedField === "phone"} />
            </InlineField>
          ) : editableValue("phone", "Số điện thoại", lead.phone ?? "Chưa cập nhật")}

          {isEditing("email") ? (
            <InlineField id="inline-lead-email" label="Email" error={errors.email}>
              <Input id="inline-lead-email" type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" aria-invalid={Boolean(errors.email)} autoFocus={lastOpenedField === "email"} />
            </InlineField>
          ) : editableValue("email", "Email", lead.email ?? "Chưa cập nhật")}

          {isEditing("dateOfBirth") ? (
            <InlineField id="inline-lead-date-of-birth" label="Ngày sinh">
              <Input id="inline-lead-date-of-birth" type="date" value={draft.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} autoFocus={lastOpenedField === "dateOfBirth"} />
            </InlineField>
          ) : editableValue("dateOfBirth", "Ngày sinh", formatDate(lead.dateOfBirth))}

          {isEditing("currentAddress") ? (
            <InlineField id="inline-lead-current-address" label="Địa chỉ">
              <Input id="inline-lead-current-address" value={draft.currentAddress} onChange={(event) => update("currentAddress", event.target.value)} autoComplete="street-address" autoFocus={lastOpenedField === "currentAddress"} />
            </InlineField>
          ) : editableValue("currentAddress", "Địa chỉ", lead.currentAddress ?? lead.specificAddress ?? "Chưa cập nhật")}

          <ReadonlyValue label="Nhóm nguồn" value={lead.origin?.name ?? "Chưa cập nhật"} />

          {isEditing("sourceId") ? (
            <InlineField id="inline-lead-source" label="Nguồn học viên" error={errors.sourceId}>
              <Select value={draft.sourceId} onValueChange={(value) => update("sourceId", value)}>
                <SelectTrigger id="inline-lead-source" className="w-full" aria-invalid={Boolean(errors.sourceId)} autoFocus={lastOpenedField === "sourceId"}><SelectValue placeholder="Chọn nguồn học viên" /></SelectTrigger>
                <SelectContent><SelectGroup>{editOptions.sources.map((source) => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </InlineField>
          ) : editableValue("sourceId", "Nguồn học viên", lead.source?.name ?? "Chưa chọn")}

          <ReadonlyValue label="Tiến trình" value={lead.pipelineStage?.name ?? "Chưa cập nhật"} />

          {canAssign && isEditing("assigneeId") ? (
            <InlineField id="inline-lead-assignee" label="Nhân viên phụ trách">
              <Select value={draft.assigneeId || "__empty__"} onValueChange={(value) => update("assigneeId", value === "__empty__" ? "" : value)}>
                <SelectTrigger id="inline-lead-assignee" className="w-full" autoFocus={lastOpenedField === "assigneeId"}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="__empty__">Chưa phân công</SelectItem>{editOptions.telesales.map((user) => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </InlineField>
          ) : (
            <ReadonlyValue label="Nhân viên phụ trách" value={lead.assignee?.fullName ?? "Chưa phân công"} editable={canUpdate && canAssign} onEdit={() => startEditingField("assigneeId")} />
          )}

          {isEditing("temperature") ? (
            <InlineField id="inline-lead-temperature" label="Mức độ quan tâm">
              <Input id="inline-lead-temperature" value={draft.temperature} onChange={(event) => update("temperature", event.target.value)} autoFocus={lastOpenedField === "temperature"} />
            </InlineField>
          ) : editableValue("temperature", "Mức độ quan tâm", lead.temperature ?? "-")}

          <ReadonlyValue label="Chương trình" value={lead.institutionProgram ? `${lead.institutionProgram.name} · ${lead.institutionProgram.institutionName}` : "Chưa chọn"} />

          {isEditing("majorId") ? (
            <InlineField id="inline-lead-major" label="Ngành đăng ký">
              <Select value={draft.majorId || "__empty__"} onValueChange={(value) => update("majorId", value === "__empty__" ? "" : value)}>
                <SelectTrigger id="inline-lead-major" className="w-full" autoFocus={lastOpenedField === "majorId"}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="__empty__">Chưa chọn</SelectItem>{editOptions.majors.map((major) => <SelectItem key={major.id} value={major.id}>{major.code ? `${major.code} - ` : ""}{major.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </InlineField>
          ) : editableValue("majorId", "Ngành đăng ký", lead.majorName ?? "Chưa chọn")}

          {isEditing("note") ? (
            <Field className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
              <FieldLabel htmlFor="inline-lead-note">Ghi chú</FieldLabel>
              <Textarea id="inline-lead-note" rows={3} value={draft.note} onChange={(event) => update("note", event.target.value)} autoFocus={lastOpenedField === "note"} />
            </Field>
          ) : (
            <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
              {editableValue("note", "Ghi chú", lead.note ?? "-")}
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
