import { useState } from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Download, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { vietnamProvinces } from "@/lib/vietnam-provinces";
import { formatLeadCustomFieldValue } from "../lead-custom-field.helpers";
import type { LeadCustomField, LeadCustomFieldFileValue, LeadCustomFieldValue } from "../lead.types";

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

type PreviewState = { file: LeadCustomFieldFileValue; message?: never } | { file?: never; message: string };

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

function isFileValue(value: unknown): value is LeadCustomFieldFileValue {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as LeadCustomFieldFileValue).name === "string" &&
      typeof (value as LeadCustomFieldFileValue).size === "number" &&
      typeof (value as LeadCustomFieldFileValue).type === "string" &&
      typeof (value as LeadCustomFieldFileValue).lastModified === "number",
  );
}

function toFileValues(value: LeadCustomFieldValue): LeadCustomFieldFileValue[] {
  if (Array.isArray(value)) return value.filter(isFileValue);
  return isFileValue(value) ? [value] : [];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileValueFromFile(file: File): Promise<LeadCustomFieldFileValue> {
  return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, dataUrl: await readFileAsDataUrl(file) };
}

function getMaxFiles(field: LeadCustomField) {
  const value = field.validationRules?.maxFiles;
  return value === 5 || value === 10 ? value : 1;
}

function getFileHref(file: LeadCustomFieldFileValue) {
  return file.url || file.dataUrl || "";
}

function isImageFile(file: LeadCustomFieldFileValue) {
  return file.type.startsWith("image/") || file.dataUrl?.startsWith("data:image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file.name);
}

function isPreviewableImage(file: LeadCustomFieldFileValue) {
  return isImageFile(file) && Boolean(getFileHref(file));
}

function downloadFile(file: LeadCustomFieldFileValue) {
  const href = getFileHref(file);
  if (!href) return false;
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function validateValue(field: LeadCustomField, value: LeadCustomFieldValue) {
  if (field.isRequired && (value === null || value === "" || (Array.isArray(value) && value.length === 0))) return "Trường này là bắt buộc.";
  if (value === null || value === "") return true;
  const rules = field.validationRules ?? {};
  if (["TEXT", "TEXTAREA"].includes(field.dataType) && typeof value === "string") {
    if (typeof rules.minLength === "number" && value.trim().length < rules.minLength) return `Cần ít nhất ${rules.minLength} ký tự.`;
    if (typeof rules.maxLength === "number" && value.trim().length > rules.maxLength) return `Tối đa ${rules.maxLength} ký tự.`;
  }
  if (field.dataType === "NUMBER") {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numberValue)) return "Vui lòng nhập số hợp lệ.";
    if (typeof rules.min === "number" && numberValue < rules.min) return `Giá trị phải từ ${rules.min}.`;
    if (typeof rules.max === "number" && numberValue > rules.max) return `Giá trị không quá ${rules.max}.`;
  }
  if (field.dataType === "EMAIL" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return "Email không hợp lệ.";
  if (field.dataType === "PHONE" && (typeof value !== "string" || !/^\d{10}$/.test(value.trim()))) return "Số điện thoại phải gồm đúng 10 chữ số.";
  if (field.dataType === "DATE" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return "Ngày không hợp lệ.";
  if (field.dataType === "DATETIME" && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) return "Ngày giờ không hợp lệ.";
  if (field.dataType === "PROVINCE" && (typeof value !== "string" || !vietnamProvinces.some((province) => province.code === value))) return "Tỉnh/thành không hợp lệ.";
  if (field.dataType === "FILE") {
    const files = toFileValues(value);
    if (files.length === 0) return field.isRequired ? "Vui lòng chọn tệp." : true;
    if (files.length > getMaxFiles(field)) return `Chỉ được chọn tối đa ${getMaxFiles(field)} tệp.`;
    if (files.some((file) => !file.name.trim() || file.size < 0 || file.size > 25 * 1024 * 1024)) return "Tệp không hợp lệ.";
  }

  const options = new Set((field.options ?? []).filter((option) => option.isActive).map((option) => option.code));
  if (field.dataType === "SELECT" && (typeof value !== "string" || !options.has(value))) return "Giá trị lựa chọn không hợp lệ.";
  if (field.dataType === "MULTI_SELECT" && (!Array.isArray(value) || value.some((item) => !options.has(item)) || new Set(value).size !== value.length)) return "Giá trị lựa chọn không hợp lệ.";
  return true;
}

export function DynamicFieldRenderer<TFormValues extends FieldValues>({ field, control, name, disabled = false, readOnly = false }: DynamicFieldRendererProps<TFormValues>) {
  const id = fieldInputId(field.id);
  const activeOptions = (field.options ?? []).filter((option) => option.isActive).sort((left, right) => left.displayOrder - right.displayOrder);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  function showPreview(file: LeadCustomFieldFileValue) {
    if (isPreviewableImage(file)) {
      setPreview({ file });
      return;
    }
    if (isImageFile(file)) {
      setPreview({ message: "File hình ảnh này chưa có dữ liệu để xem trước. Vui lòng thay thế hoặc chọn lại file rồi lưu." });
      return;
    }
    setPreview({ message: "Không thể xem trước, vui lòng tải file về." });
  }

  function handleDownload(file: LeadCustomFieldFileValue) {
    if (!downloadFile(file)) setPreview({ message: "File này chưa có dữ liệu để tải về. Vui lòng thay thế hoặc chọn lại file rồi lưu." });
  }

  return (
    <>
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
          const selectedValues = new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
          const fileValues = toFileValues(value);
          const maxFiles = getMaxFiles(field);
          const canAddFiles = fileValues.length < maxFiles && !disabled;
          const applyFiles = (files: LeadCustomFieldFileValue[]) => formField.onChange(files.length > 0 ? files : null);
          const addFiles = async (selectedFiles: FileList | null) => {
            const selected = await Promise.all(Array.from(selectedFiles ?? []).map(fileValueFromFile));
            if (selected.length === 0) return;
            applyFiles([...fileValues, ...selected].slice(0, maxFiles));
          };
          const replaceFile = async (index: number, selectedFiles: FileList | null) => {
            const file = selectedFiles?.[0];
            if (!file) return;
            const nextFiles = [...fileValues];
            nextFiles[index] = await fileValueFromFile(file);
            applyFiles(nextFiles);
          };
          const removeFile = (index: number) => applyFiles(fileValues.filter((_, itemIndex) => itemIndex !== index));

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
                <Select key={scalarValue || "__empty__"} value={scalarValue || "__empty__"} onValueChange={(nextValue) => formField.onChange(nextValue === "__empty__" ? null : nextValue)} disabled={disabled}>
                  <SelectTrigger {...commonProps} className="w-full"><SelectValue placeholder="Chọn giá trị" /></SelectTrigger>
                  <SelectContent><SelectItem value="__empty__">Chưa chọn</SelectItem>{activeOptions.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : field.dataType === "PROVINCE" ? (
                <Select key={scalarValue || "__empty__"} value={scalarValue || "__empty__"} onValueChange={(nextValue) => formField.onChange(nextValue === "__empty__" ? null : nextValue)} disabled={disabled}>
                  <SelectTrigger {...commonProps} className="w-full"><SelectValue placeholder="Chọn tỉnh/thành" /></SelectTrigger>
                  <SelectContent><SelectItem value="__empty__">Chưa chọn</SelectItem>{vietnamProvinces.map((province) => <SelectItem key={province.code} value={province.code}>{province.label}</SelectItem>)}</SelectContent>
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
              ) : field.dataType === "FILE" ? (
                <div className="flex flex-col gap-3">
                  <Input
                    {...commonProps}
                    type="file"
                    multiple={maxFiles > 1}
                    disabled={!canAddFiles}
                    onChange={(event) => {
                      void addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Đã chọn {fileValues.length}/{maxFiles} tệp</span>
                    {!canAddFiles && fileValues.length >= maxFiles && <span>Đã đạt số lượng tối đa.</span>}
                  </div>
                  {fileValues.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {fileValues.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${file.type}-${file.lastModified}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                          <div className="flex items-center gap-1">
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Xem ${file.name}`} onClick={() => showPreview(file)}>
                              <Eye className="size-4" aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Tải ${file.name}`} onClick={() => handleDownload(file)}>
                              <Download className="size-4" aria-hidden="true" />
                            </Button>
                            <Input
                              id={`${id}-replace-${index}`}
                              type="file"
                              disabled={disabled}
                              className="sr-only"
                              onChange={(event) => {
                                void replaceFile(index, event.target.files);
                                event.target.value = "";
                              }}
                            />
                            <label
                              htmlFor={`${id}-replace-${index}`}
                              className={`inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${disabled ? "pointer-events-none opacity-50" : ""}`}
                            >
                              Thay thế
                            </label>
                            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => removeFile(index)}>
                              Xóa
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.file ? preview.file.name : "Xem trước tệp"}</DialogTitle>
            <DialogDescription>{preview?.file ? "Xem trước hình ảnh đã chọn." : "Tệp này không hỗ trợ xem trước trực tiếp."}</DialogDescription>
          </DialogHeader>
          {preview?.file ? (
            <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/20 p-2">
              <img src={getFileHref(preview.file)} alt={preview.file.name} className="mx-auto max-h-[65vh] w-auto max-w-full rounded object-contain" />
            </div>
          ) : (
            <p className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{preview?.message}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
