import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLeadCustomFieldValue } from "../lead-custom-field.helpers";
import type { LeadCustomField, LeadCustomFieldValue } from "../lead.types";

export type LeadCustomFieldsFormValues = {
  values: Record<string, LeadCustomFieldValue>;
};

type DynamicFieldRendererProps<TFormValues extends FieldValues> = {
  field: LeadCustomField;
  control: Control<TFormValues>;
  name: Path<TFormValues>;
  disabled?: boolean;
  readOnly?: boolean;
};

function fieldInputId(fieldId: string) {
  return `lead-custom-field-${fieldId}`;
}

function toDateInputValue(value: LeadCustomFieldValue) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function toDateTimeInputValue(value: LeadCustomFieldValue) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function validateValue(field: LeadCustomField, value: LeadCustomFieldValue) {
  if (field.isRequired && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) return "Trường này là bắt buộc.";
  if (value === null || value === "") return true;
  const rules = field.validationRules ?? {};
  if (["TEXT", "TEXTAREA"].includes(field.dataType) && typeof value === "string") {
    if (typeof rules.minLength === "number" && value.trim().length < rules.minLength) return `Cần ít nhất ${rules.minLength} ký tự.`;
    if (typeof rules.maxLength === "number" && value.trim().length > rules.maxLength) return `Tối đa ${rules.maxLength} ký tự.`;
  }
  if (field.dataType === "NUMBER") { const numberValue = typeof value === "number" ? value : Number(value); if (!Number.isFinite(numberValue)) return "Vui lòng nhập số hợp lệ."; if (typeof rules.min === "number" && numberValue < rules.min) return `Giá trị phải từ ${rules.min}.`; if (typeof rules.max === "number" && numberValue > rules.max) return `Giá trị không quá ${rules.max}.`; }
  if (field.dataType === "EMAIL" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return "Email không hợp lệ.";
  if (field.dataType === "PHONE" && (typeof value !== "string" || !/^\d{10}$/.test(value.trim()))) return "Số điện thoại phải gồm đúng 10 chữ số.";
  if (field.dataType === "DATE" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return "Ngày không hợp lệ.";
  if (field.dataType === "DATETIME" && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) return "Ngày giờ không hợp lệ.";
  const options = new Set((field.options ?? []).filter((option) => option.isActive).map((option) => option.code));
  if (field.dataType === "SELECT" && (typeof value !== "string" || !options.has(value))) return "Giá trị lựa chọn không hợp lệ.";
  if (field.dataType === "MULTI_SELECT" && (!Array.isArray(value) || value.some((item) => !options.has(item)) || new Set(value).size !== value.length)) return "Giá trị lựa chọn không hợp lệ.";
  return true;
}

export function DynamicFieldRenderer<TFormValues extends FieldValues>({ field, control, name, disabled = false, readOnly = false }: DynamicFieldRendererProps<TFormValues>) {
  const id = fieldInputId(field.id);
  const activeOptions = (field.options ?? []).filter((option) => option.isActive).sort((left, right) => left.displayOrder - right.displayOrder);

  return (
    <Controller<TFormValues>
      control={control}
      name={name}
      rules={{
        validate: (value) => validateValue(field, value as LeadCustomFieldValue),
      }}
      render={({ field: formField, fieldState }) => {
        const rawValue: unknown = formField.value;
        const value = (rawValue ?? null) as LeadCustomFieldValue;
        if (readOnly || !field.canEdit) {
          return (
            <Field>
              <FieldLabel>{field.name}</FieldLabel>
              {field.description && <FieldDescription>{field.description}</FieldDescription>}
              <p className="text-sm font-medium">{formatLeadCustomFieldValue(field, value)}</p>
            </Field>
          );
        }

        const commonProps = {
          id,
          disabled,
          "aria-invalid": Boolean(fieldState.error),
          "aria-describedby": [field.description ? `${id}-description` : "", fieldState.error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined,
        };
        const scalarValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
        const selectedValues = new Set(Array.isArray(value) ? value : []);

        return (
          <Field data-invalid={Boolean(fieldState.error)}>
            <FieldLabel htmlFor={id}>{field.name}{field.isRequired ? " *" : ""}</FieldLabel>
            {field.description && <FieldDescription id={`${id}-description`}>{field.description}</FieldDescription>}
            {field.dataType === "TEXTAREA" ? (
              <Textarea {...commonProps} value={scalarValue} onChange={(event) => formField.onChange(event.target.value)} rows={4} />
            ) : field.dataType === "BOOLEAN" ? (
              <label className="flex items-center gap-3 text-sm" htmlFor={id}>
                <Checkbox {...commonProps} checked={value === true} onCheckedChange={(checked) => formField.onChange(checked === true)} />
                Có
              </label>
            ) : field.dataType === "SELECT" ? (
              <Select value={scalarValue || "__empty__"} onValueChange={(nextValue) => formField.onChange(nextValue === "__empty__" ? null : nextValue)} disabled={disabled}>
                <SelectTrigger {...commonProps} className="w-full"><SelectValue placeholder="Chọn giá trị" /></SelectTrigger>
                <SelectContent><SelectItem value="__empty__">Chưa chọn</SelectItem>{activeOptions.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            ) : field.dataType === "MULTI_SELECT" ? (
              <div className="flex flex-col gap-2" role="group" aria-describedby={commonProps["aria-describedby"]}>
                {activeOptions.map((option) => {
                  const selected = selectedValues.has(option.code);
                  return <label key={option.code} className="flex items-center gap-3 text-sm" htmlFor={`${id}-${option.code}`}><Checkbox id={`${id}-${option.code}`} disabled={disabled} checked={selected} onCheckedChange={(checked) => {
                    const current: string[] = Array.isArray(rawValue) ? rawValue.filter((item): item is string => typeof item === "string") : [];
                    formField.onChange(checked === true ? [...current, option.code] : current.filter((item) => item !== option.code));
                  }} />{option.label}</label>;
                })}
              </div>
            ) : (
              <Input
                {...commonProps}
                type={field.dataType === "NUMBER" ? "number" : field.dataType === "DATE" ? "date" : field.dataType === "DATETIME" ? "datetime-local" : field.dataType === "EMAIL" ? "email" : field.dataType === "PHONE" ? "tel" : "text"}
                inputMode={field.dataType === "NUMBER" ? "decimal" : field.dataType === "PHONE" ? "tel" : undefined}
                value={field.dataType === "DATE" ? toDateInputValue(value) : field.dataType === "DATETIME" ? toDateTimeInputValue(value) : scalarValue}
                onChange={(event) => formField.onChange(event.target.value)}
              />
            )}
            <FieldError id={`${id}-error`} errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}
