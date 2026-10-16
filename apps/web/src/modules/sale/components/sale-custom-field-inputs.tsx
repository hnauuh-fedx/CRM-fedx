import type { Control, FieldValues, Path } from "react-hook-form";
import type {
  LeadCustomField,
  LeadCustomFieldValue,
} from "@/modules/leads/lead.types";
import { DynamicFieldRenderer } from "@/modules/leads/components/dynamic-field-renderer";
import { FieldGroup } from "@/components/ui/field";
export function SaleCustomFieldInputs<
  T extends FieldValues & {
    customFieldValues: Record<string, LeadCustomFieldValue>;
  },
>({
  fieldsByGroup,
  control,
  isPending,
  isLoading,
  isError,
  emptyLabel,
}: {
  fieldsByGroup: LeadCustomField[][];
  control: Control<T>;
  isPending: boolean;
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
}) {
  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        Đang tải trường dữ liệu bổ sung...
      </p>
    );
  if (isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Không thể tải trường dữ liệu bổ sung. Vui lòng thử lại.
      </p>
    );
  if (fieldsByGroup.length === 0)
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  const inlineFields = fieldsByGroup
    .filter((fields) => fields[0]?.group.key === "basic")
    .flat();
  const groupedFields = fieldsByGroup.filter(
    (fields) => fields[0]?.group.key !== "basic",
  );
  return (
    <>
      {inlineFields.map((field) =>
        field.canView ? (
          <DynamicFieldRenderer
            key={field.id}
            field={field}
            control={control}
            name={`customFieldValues.${field.id}` as Path<T>}
            disabled={isPending}
          />
        ) : (
          <div key={field.id}>
            <p className="text-sm text-muted-foreground">{field.name}</p>
            <p className="text-sm font-medium">Không có quyền xem</p>
          </div>
        ),
      )}
      {groupedFields.length > 0 && (
        <div className="flex flex-col gap-4 rounded-md border border-border/70 bg-muted/10 p-3">
          {groupedFields.map((fields) => (
            <div key={fields[0]?.group.id} className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {fields[0]?.group.label}
                </p>
                {fields[0]?.group.description && (
                  <p className="text-xs text-muted-foreground">
                    {fields[0].group.description}
                  </p>
                )}
              </div>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                {fields.map((field) =>
                  field.canView ? (
                    <DynamicFieldRenderer
                      key={field.id}
                      field={field}
                      control={control}
                      name={`customFieldValues.${field.id}` as Path<T>}
                      disabled={isPending}
                    />
                  ) : (
                    <div key={field.id}>
                      <p className="text-sm text-muted-foreground">
                        {field.name}
                      </p>
                      <p className="text-sm font-medium">Không có quyền xem</p>
                    </div>
                  ),
                )}
              </FieldGroup>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
