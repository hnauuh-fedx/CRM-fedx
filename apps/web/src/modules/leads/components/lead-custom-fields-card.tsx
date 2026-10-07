import { useEffect, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Pencil } from "lucide-react";

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
  const query = useQuery({
    queryKey: ["leads", leadId, "custom-fields"],
    queryFn: () => getLeadCustomFields(leadId, auth.accessToken!),
    enabled: Boolean(leadId && auth.accessToken),
  });
  const fields = query.data?.fields ?? [];

  if (query.isLoading) {
    return (
      <Card className="border-border/70 shadow-xs">
        <CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Đang tải trường dữ liệu bổ sung.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="border-border/70 shadow-xs">
        <CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Không thể tải trường dữ liệu bổ sung.</CardDescription></CardHeader>
        <CardContent><Button type="button" variant="outline" onClick={() => query.refetch()}>Thử lại</Button></CardContent>
      </Card>
    );
  }

  if (fields.length === 0) {
    return (
      <Card className="border-border/70 shadow-xs">
        <CardHeader><CardTitle>Thông tin bổ sung</CardTitle><CardDescription>Chưa có trường dữ liệu bổ sung áp dụng cho lead này.</CardDescription></CardHeader>
      </Card>
    );
  }

  return <LeadCustomFieldsEditor leadId={leadId} fields={fields} accessToken={auth.accessToken!} />;
}

function LeadCustomFieldsEditor({ leadId, fields, accessToken }: { leadId: string; fields: LeadCustomField[]; accessToken: string }) {
  const queryClient = useQueryClient();
  const form = useForm<LeadCustomFieldsFormValues>({ defaultValues: createFormValues(fields) });
  const [isEditingAll, setIsEditingAll] = useState(false);
  const [editingFieldIds, setEditingFieldIds] = useState<Set<string>>(() => new Set());
  const [successMessage, setSuccessMessage] = useState("");
  const editableFields = fields.filter((field) => field.canView && field.canEdit);
  const hasActiveEdits = isEditingAll || editingFieldIds.size > 0;

  useEffect(() => {
    if (!hasActiveEdits) form.reset(createFormValues(fields));
  }, [fields, form, hasActiveEdits]);

  const mutation = useMutation({
    mutationFn: (input: LeadCustomFieldUpdateInput) => updateLeadCustomFields(leadId, input, accessToken),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["leads", leadId, "custom-fields"] }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
        queryClient.invalidateQueries({ queryKey: ["sale"] }),
      ]);
      setIsEditingAll(false);
      setEditingFieldIds(new Set());
      setSuccessMessage("Đã lưu thông tin bổ sung.");
      window.setTimeout(() => setSuccessMessage(""), 4_000);
    },
  });

  const startEditingAll = () => {
    mutation.reset();
    setSuccessMessage("");
    form.reset(createFormValues(fields));
    setEditingFieldIds(new Set());
    setIsEditingAll(true);
  };

  const startEditingField = (fieldId: string) => {
    if (!hasActiveEdits) {
      mutation.reset();
      setSuccessMessage("");
      form.reset(createFormValues(fields));
    }
    setEditingFieldIds((current) => new Set(current).add(fieldId));
  };

  const cancelEditing = () => {
    if (mutation.isPending) return;
    form.reset(createFormValues(fields));
    mutation.reset();
    setIsEditingAll(false);
    setEditingFieldIds(new Set());
  };

  const submit = form.handleSubmit((values) => {
    const selectedFields = isEditingAll ? editableFields : editableFields.filter((field) => editingFieldIds.has(field.id));
    const updates = selectedFields
      .filter((field) => form.getFieldState(`values.${field.id}`).isDirty)
      .map((field) => ({ fieldId: field.id, value: toPatchValue(field, values.values[field.id] ?? null) }));

    if (updates.length === 0) {
      cancelEditing();
      return;
    }
    mutation.mutate({ values: updates });
  });

  const isEditing = (field: LeadCustomField) => field.canView && field.canEdit && (isEditingAll || editingFieldIds.has(field.id));

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Thông tin bổ sung</CardTitle>
          <CardDescription>Trường dữ liệu tùy chỉnh áp dụng cho hồ sơ lead này.</CardDescription>
        </div>
        {editableFields.length > 0 && (hasActiveEdits ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={cancelEditing} disabled={mutation.isPending}>
              Hủy
            </Button>
          </div>
        ) : (
          <Button type="button" size="icon-sm" onClick={startEditingAll} aria-label="Chỉnh sửa thông tin bổ sung">
            <Pencil aria-hidden="true" />
          </Button>
        ))}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {successMessage && (
          <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-50 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
            {successMessage}
          </div>
        )}
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{errorMessage(mutation.error)}</p>}
        <form onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2">
            {fields.map((field) => {
              if (!field.canView) return <HiddenSensitiveField key={field.id} field={field} />;
              if (isEditing(field)) {
                return <DynamicFieldRenderer key={field.id} field={field} control={form.control} name={`values.${field.id}`} disabled={mutation.isPending} />;
              }
              return <ReadonlyCustomField key={field.id} field={field} onEdit={field.canEdit ? () => startEditingField(field.id) : undefined} />;
            })}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ReadonlyCustomField({ field, onEdit }: { field: LeadCustomField; onEdit?: () => void }) {
  const value = formatLeadCustomFieldValue(field, field.value);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (onEdit && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onEdit();
    }
  };

  return (
    <div
      className={onEdit ? "cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" : undefined}
      onDoubleClick={onEdit}
      onKeyDown={onEdit ? handleKeyDown : undefined}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      title={onEdit ? `Nhấp đúp để chỉnh sửa ${field.name.toLocaleLowerCase("vi-VN")}` : undefined}
      aria-label={onEdit ? `${field.name}: ${value}. Nhấn Enter hoặc nhấp đúp để chỉnh sửa.` : undefined}
    >
      <p className="text-sm text-muted-foreground">{field.name}</p>
      {field.description && <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>}
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function HiddenSensitiveField({ field }: { field: LeadCustomField }) {
  return <div><p className="text-sm text-muted-foreground">{field.name}</p><p className="mt-1 text-sm font-medium">Không có quyền xem</p></div>;
}
