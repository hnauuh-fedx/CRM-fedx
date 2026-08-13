import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { FieldGroup } from "@/components/ui/field";
import { useAuth } from "@/modules/auth/auth-context";
import { DynamicFieldRenderer } from "@/modules/leads/components/dynamic-field-renderer";
import type { LeadCustomField, LeadCustomFieldValue } from "@/modules/leads/lead.types";
import { getRuntimeCustomFields, type RuntimeCustomFieldEntityType } from "@/services/custom-field.service";

type Values = { values: Record<string, LeadCustomFieldValue> };

export function RuntimeCustomFieldsSection({ entityType, entityId, disabled, onChange }: {
  entityType: RuntimeCustomFieldEntityType;
  entityId?: string;
  disabled?: boolean;
  onChange: (values: Record<string, LeadCustomFieldValue>) => void;
}) {
  const auth = useAuth();
  const form = useForm<Values>({ defaultValues: { values: {} } });
  const query = useQuery({
    queryKey: ["runtime-custom-fields", entityType, entityId ?? "new"],
    queryFn: () => getRuntimeCustomFields(entityType, entityId, auth.accessToken!),
    enabled: Boolean(auth.accessToken),
  });
  const fields = useMemo(() => query.data?.fields ?? [], [query.data?.fields]);
  const groups = useMemo(() => groupFields(fields), [fields]);
  const values = form.watch("values");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const initial: Record<string, LeadCustomFieldValue> = {};
    for (const field of fields) if (field.canView && field.canEdit) initial[field.id] = field.value ?? field.defaultValue ?? null;
    form.reset({ values: initial });
    onChangeRef.current(initial);
  }, [fields, form]);
  useEffect(() => { onChangeRef.current(values); }, [values]);

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Đang tải trường dữ liệu bổ sung...</p>;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">Không thể tải trường dữ liệu bổ sung. Vui lòng thử lại.</p>;
  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group[0].group.id} className={group[0].group.key === "basic" ? "contents" : "flex flex-col gap-3 rounded-md border border-border/70 bg-muted/10 p-3"}>
          {group[0].group.key !== "basic" && <div><p className="text-sm font-semibold">{group[0].group.label}</p>{group[0].group.description && <p className="text-xs text-muted-foreground">{group[0].group.description}</p>}</div>}
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {group.map((field) => field.canView
              ? <DynamicFieldRenderer key={field.id} field={field} control={form.control} name={`values.${field.id}`} disabled={disabled || !field.canEdit} />
              : <div key={field.id}><p className="text-sm text-muted-foreground">{field.name}</p><p className="text-sm font-medium">Không có quyền xem</p></div>)}
          </FieldGroup>
        </section>
      ))}
    </div>
  );
}

function groupFields(fields: LeadCustomField[]) {
  const groups = new Map<string, LeadCustomField[]>();
  for (const field of fields) groups.set(field.group.id, [...(groups.get(field.group.id) ?? []), field]);
  return [...groups.values()].sort((left, right) => left[0].group.displayOrder - right[0].group.displayOrder);
}
