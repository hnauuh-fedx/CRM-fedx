import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AUTOMATION_INFORMATION_UPDATE_LIMIT, automationInformationUpdatesSchema, validateInformationUpdate, type AutomationInformationUpdate, type AutomationWritableField } from "@admission-crm/shared/automation-information-update";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AutomationFieldPicker } from "./automation-field-picker";

type Props = {
  updates: AutomationInformationUpdate[];
  fields: AutomationWritableField[];
  isLoading: boolean;
  onChange: (updates: AutomationInformationUpdate[]) => void;
};

export function InformationUpdateFields({ updates, fields, isLoading, onChange }: Props) {
  const validation = automationInformationUpdatesSchema.safeParse(updates);
  return (
    <FieldSet disabled={isLoading} className="min-w-0">
      <FieldLegend>Các trường cập nhật</FieldLegend>
      <FieldDescription>Áp dụng cho Lead đang đi qua node. Chỉ các trường được chọn sẽ thay đổi.</FieldDescription>
      {!isLoading && fields.length ? <FieldDescription>{fields.filter((field) => !field.readOnlyReason).length} trường có thể cập nhật; {fields.filter((field) => field.readOnlyReason).length} trường quản lý theo quy trình riêng. Danh mục phụ thuộc quyền và chương trình hiện tại.</FieldDescription> : null}
      {isLoading ? <p role="status">Đang tải trường thông tin…</p> : null}
      {!isLoading && !fields.length ? <p role="status">Không có trường được phép cập nhật trong phạm vi này.</p> : null}
      <FieldGroup>
        {updates.map((update, index) => (
          <InformationUpdateRow
            key={update.id ?? update.field}
            update={update}
            fields={fields.filter((field) => field.reference === update.field || !updates.some((row) => row.field === field.reference))}
            number={index + 1}
            error={!validation.success ? validation.error.issues.find((issue) => issue.path[0] === index)?.message : undefined}
            onChange={(next) => onChange(updates.map((row, rowIndex) => rowIndex === index ? next : row))}
            onRemove={() => onChange(updates.filter((_, rowIndex) => rowIndex !== index))}
          />
        ))}
      </FieldGroup>
      {!updates.length ? <p role="alert" className="text-sm text-destructive">Thêm ít nhất một trường cập nhật.</p> : null}
      <Button type="button" variant="outline" className="min-h-11" disabled={isLoading || !fields.length || updates.length >= AUTOMATION_INFORMATION_UPDATE_LIMIT || updates.length >= fields.filter((field) => !field.readOnlyReason).length}
        onClick={() => onChange([...updates, { id: crypto.randomUUID(), field: "", operation: "set" }])}>
        <Plus data-icon="inline-start" />Thêm trường cập nhật
      </Button>
    </FieldSet>
  );
}

type RowProps = {
  update: AutomationInformationUpdate;
  fields: AutomationWritableField[];
  number: number;
  error?: string;
  onChange: (update: AutomationInformationUpdate) => void;
  onRemove: () => void;
};

function InformationUpdateRow({ update, fields, number, error, onChange, onRemove }: RowProps) {
  const id = useId();
  const field = fields.find((candidate) => candidate.reference === update.field);
  const message = error ?? (field ? validateInformationUpdate(update, field) : update.field ? "Trường không còn khả dụng. Vui lòng chọn lại." : "Vui lòng chọn trường thông tin.");
  return (
    <FieldSet className="min-w-0 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <FieldLegend className="mb-0">Trường {number}</FieldLegend>
        <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`Xóa dòng cập nhật ${number}`} onClick={onRemove}><Trash2 /></Button>
      </div>
      <FieldGroup>
        <Field data-invalid={Boolean(message)}>
          <FieldLabel id={`${id}-field-label`}>Trường thông tin</FieldLabel>
          <AutomationFieldPicker fields={fields} selectedReference={update.field} placeholder="Chọn trường thông tin"
            labelId={`${id}-field-label`}
            invalid={Boolean(message)} errorId={`${id}-error`}
            onSelect={(selected) => onChange({ id: update.id ?? crypto.randomUUID(), field: selected.reference, operation: "set" })} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-operation`}>Thao tác</FieldLabel>
          <Select value={update.operation} onValueChange={(operation) => {
            if (operation === "clear") onChange({ id: update.id, field: update.field, operation });
            else onChange({ ...update, operation: "set", value: undefined });
          }}>
            <SelectTrigger id={`${id}-operation`} className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="set">Gán giá trị</SelectItem>
              <SelectItem value="clear" disabled={!field?.canClear}>Xóa giá trị</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        {field && update.operation === "set" ? (
          <InformationValueInput id={`${id}-value`} field={field} value={update.value} invalid={Boolean(message)} errorId={`${id}-error`}
            onChange={(value) => onChange({ ...update, value })} />
        ) : null}
        {update.operation === "clear" ? <FieldDescription>Giá trị hiện tại của trường sẽ bị xóa khi Lead chạy qua node.</FieldDescription> : null}
        {message ? <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{message}</p> : null}
      </FieldGroup>
    </FieldSet>
  );
}

type ValueProps = {
  id: string;
  field: AutomationWritableField;
  value: AutomationInformationUpdate["value"];
  invalid: boolean;
  errorId: string;
  onChange: (value: AutomationInformationUpdate["value"]) => void;
};

function InformationValueInput({ id, field, value, invalid, errorId, onChange }: ValueProps) {
  const props = { id, field, value, invalid, errorId, onChange };
  if (field.dataType === "MULTI_SELECT") return <MultiSelectValueInput {...props} />;
  if (["SELECT", "BOOLEAN", "PROVINCE"].includes(field.dataType)) return <SelectValueInput {...props} />;
  if (["STRING_LIST", "FILE"].includes(field.dataType)) return <ListValueInput key={field.reference} {...props} />;
  if (field.dataType === "DATETIME") return <DateTimeValueInput key={field.reference} {...props} />;
  return <TextValueInput {...props} />;
}

function MultiSelectValueInput({ id, field, value, invalid, errorId, onChange }: ValueProps) {
  const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const selectedCodes = new Set(selected);
  return <FieldSet aria-describedby={invalid ? errorId : undefined}>
      <FieldLegend>Giá trị</FieldLegend>
      <FieldDescription>Thay thế toàn bộ danh sách hiện tại bằng các lựa chọn dưới đây.</FieldDescription>
      <FieldGroup>{field.options.map((option) => <Field key={option.code} orientation="horizontal">
        <Checkbox id={`${id}-${option.code}`} checked={selectedCodes.has(option.code)} aria-invalid={invalid}
          onCheckedChange={(checked) => onChange(checked === true ? [...selected, option.code] : selected.filter((item) => item !== option.code))} />
        <FieldLabel htmlFor={`${id}-${option.code}`}>{option.label}</FieldLabel>
      </Field>)}</FieldGroup>
    </FieldSet>;
}

function ListValueInput({ id, field, value, invalid, errorId, onChange }: ValueProps) {
  const isFile = field.dataType === "FILE";
  const initial = Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : item.url).join("\n") : "";
  return <Field data-invalid={invalid}>
    <FieldLabel htmlFor={id}>Giá trị</FieldLabel>
    <Textarea id={id} defaultValue={initial} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => {
        const lines = event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        onChange(isFile ? lines.map((url) => {
          let name = "Tệp đính kèm";
          try { name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? name); } catch { /* Validation displays incomplete URLs. */ }
          const existing = Array.isArray(value) ? value.find((item) => typeof item !== "string" && item.url === url) : undefined;
          return typeof existing === "object" ? existing : { name, url, size: 0, type: "application/octet-stream", lastModified: 0 };
        }) : lines);
      }} />
    <FieldDescription>{isFile ? "Mỗi dòng là một liên kết HTTP/HTTPS tới tệp đã lưu trữ. Giới hạn số tệp theo cấu hình trường." : "Mỗi dòng là một giá trị. Danh sách này thay thế toàn bộ danh sách hiện tại."}</FieldDescription>
  </Field>;
}

function DateTimeValueInput({ id, value, invalid, errorId, onChange }: ValueProps) {
  const date = typeof value === "string" ? new Date(value) : null;
  const initial = date && !Number.isNaN(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
  return <Field data-invalid={invalid}>
    <FieldLabel htmlFor={id}>Giá trị</FieldLabel>
    <Input id={id} type="datetime-local" defaultValue={initial} className="min-h-11" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => { const next = new Date(event.target.value); onChange(Number.isNaN(next.getTime()) ? undefined : next.toISOString()); }} />
  </Field>;
}

function SelectValueInput({ id, field, value, invalid, errorId, onChange }: ValueProps) {
  const choices = field.dataType === "BOOLEAN" ? [{ code: "true", label: "Có" }, { code: "false", label: "Không" }] : field.options;
  return <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>Giá trị</FieldLabel>
      <Select value={value === undefined ? "" : String(value)} onValueChange={(next) => onChange(field.dataType === "BOOLEAN" ? next === "true" : next)}>
        <SelectTrigger id={id} className="min-h-11" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}><SelectValue placeholder="Chọn giá trị" /></SelectTrigger>
        <SelectContent><SelectGroup>{choices.map((option) => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>;
}

function TextValueInput({ id, field, value, invalid, errorId, onChange }: ValueProps) {
  const inputProps = { id, value: typeof value === "string" || typeof value === "number" ? value : "", "aria-invalid": invalid, "aria-describedby": invalid ? errorId : undefined };
  return <Field data-invalid={invalid}>
    <FieldLabel htmlFor={id}>Giá trị</FieldLabel>
    {field.dataType === "TEXTAREA" ? <Textarea {...inputProps} onChange={(event) => onChange(event.target.value)} /> :
      <Input {...inputProps} className="min-h-11" type={({ NUMBER: "number", DATE: "date", EMAIL: "email", PHONE: "tel" } as Record<string, string>)[field.dataType] ?? "text"}
        step={field.dataType === "NUMBER" ? "any" : undefined}
        onChange={(event) => onChange(field.dataType === "NUMBER" ? event.target.value === "" ? undefined : Number(event.target.value) : event.target.value)} />}
  </Field>;
}
