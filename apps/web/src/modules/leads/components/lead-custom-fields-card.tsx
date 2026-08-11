import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/modules/auth/auth-context";
import { ApiError } from "@/services/api";
import { getLeadCustomFields, updateLeadCustomFields } from "@/services/lead.service";
import type { LeadCustomField, LeadCustomFieldUpdateInput, LeadCustomFieldValue } from "../lead.types";
import { formatLeadCustomFieldValue } from "../lead-custom-field.helpers";
import { DynamicFieldRenderer, type LeadCustomFieldsFormValues } from "./dynamic-field-renderer";

function createFormValues(fields: LeadCustomField[]): LeadCustomFieldsFormValues {
  const values: Record<string, LeadCustomFieldValue> = {};
  for (const field of fields) {
    if (field.canView) values[field.id] = field.value;
  }
  return { values };
}

function toPatchValue(field: LeadCustomField, value: LeadCustomFieldValue): LeadCustomFieldValue {
  if (value === "") return null;
  if (field.dataType === "NUMBER" && typeof value === "string") return Number(value);
  if (field.dataType === "DATETIME" && typeof value === "string") return new Date(value).toISOString();
  return value;
}

function errorMessage(error: Error) {
  return error instanceof ApiError ? error.message : "Không thể lưu trường dữ liệu bổ sung. Vui lòng thử lại.";
}

export function LeadCustomFieldsCard({ leadId }: { leadId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const canViewCustomFields = auth.can("custom_field.view");
  const query = useQuery({
    queryKey: ["leads", leadId, "custom-fields"],
    queryFn: () => getLeadCustomFields(leadId, auth.accessToken!),
    enabled: Boolean(leadId && auth.accessToken && canViewCustomFields),
  });
  const fields = query.data?.fields ?? [];

  if (!canViewCustomFields) {
    return <Card className="border-border/70 shadow-xs"><CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Bạn không có quyền xem trường dữ liệu tùy chỉnh.</CardDescription></CardHeader></Card>;
  }
  if (query.isLoading) {
    return <Card className="border-border/70 shadow-xs"><CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Đang tải trường dữ liệu bổ sung.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></CardContent></Card>;
  }
  if (query.isError) {
    return <Card className="border-border/70 shadow-xs"><CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Không thể tải trường dữ liệu bổ sung.</CardDescription></CardHeader><CardContent><Button type="button" variant="outline" onClick={() => query.refetch()}>Thử lại</Button></CardContent></Card>;
  }
  if (fields.length === 0) {
    return <Card className="border-border/70 shadow-xs"><CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Chưa có trường dữ liệu bổ sung áp dụng cho lead này.</CardDescription></CardHeader></Card>;
  }

  const editableFields = fields.filter((field) => field.canView && field.canEdit);
  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Trường dữ liệu tùy chỉnh áp dụng cho hồ sơ lead này.</CardDescription></div>
        {!isEditing && editableFields.length > 0 && <Button type="button" variant="outline" onClick={() => { setSuccessMessage(""); setIsEditing(true); }}>Chỉnh sửa</Button>}
      </CardHeader>
      <CardContent>
        {successMessage && <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">{successMessage}</div>}
        {isEditing ? (
          <LeadCustomFieldsEditor leadId={leadId} fields={fields} accessToken={auth.accessToken!} onCancel={() => setIsEditing(false)} onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["leads", leadId, "custom-fields"] });
            setIsEditing(false);
            setSuccessMessage("Đã lưu thông tin bổ sung.");
            window.setTimeout(() => setSuccessMessage(""), 4_000);
          }} />
        ) : (
          <dl className="grid gap-5 md:grid-cols-2">
            {fields.map((field) => field.canView ? <div key={field.id}><dt className="text-sm text-muted-foreground">{field.name}</dt>{field.description && <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>}<dd className="mt-1 text-sm font-medium">{formatLeadCustomFieldValue(field, field.value)}</dd></div> : <HiddenSensitiveField key={field.id} field={field} />)}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function LeadCustomFieldsEditor({ leadId, fields, accessToken, onCancel, onSaved }: { leadId: string; fields: LeadCustomField[]; accessToken: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const form = useForm<LeadCustomFieldsFormValues>({ defaultValues: createFormValues(fields) });
  const editableFields = fields.filter((field) => field.canView && field.canEdit);
  const mutation = useMutation({ mutationFn: (input: LeadCustomFieldUpdateInput) => updateLeadCustomFields(leadId, input, accessToken), onSuccess: onSaved });
  const submit = form.handleSubmit((values) => {
    const updates: LeadCustomFieldUpdateInput["values"] = [];
    for (const field of editableFields) {
      if (form.getFieldState(`values.${field.id}`).isDirty) updates.push({ fieldId: field.id, value: toPatchValue(field, values.values[field.id] ?? null) });
    }
    if (updates.length === 0) {
      onCancel();
      return;
    }
    mutation.mutate({ values: updates });
  });

  return <form className="flex flex-col gap-5" onSubmit={submit}>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(mutation.error)}</p>}
    <div className="grid gap-5 md:grid-cols-2">{fields.map((field) => field.canView ? <DynamicFieldRenderer key={field.id} field={field} control={form.control} name={`values.${field.id}`} disabled={mutation.isPending} /> : <HiddenSensitiveField key={field.id} field={field} />)}</div>
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>Hủy</Button>
      <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}</Button>
    </div>
  </form>;
}

function HiddenSensitiveField({ field }: { field: LeadCustomField }) {
  return <div><p className="text-sm text-muted-foreground">{field.name}</p><p className="mt-1 text-sm font-medium">Không có quyền xem</p></div>;
}
