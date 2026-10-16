import type { UseFormReturn } from "react-hook-form";
import { normalizeMarketingFormOptions } from "@admission-crm/shared/marketing-form-config";
import { marketingFormVisibilityOperators, marketingFormVisibilityParentTypes, validateMarketingFormVisibility, type MarketingFormVisibility } from "@admission-crm/shared/marketing-form-visibility";
import { marketingFormPublicationType } from "@admission-crm/shared/marketing-form-submission-policy";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MarketingFormInput, MarketingFormField } from "./marketing-reference.types";
const labels = { equals: "Bằng", not_equals: "Khác (đã trả lời)", contains: "Có chứa", is_empty: "Trống", is_not_empty: "Không trống" };
const parentTypes = new Set(marketingFormVisibilityParentTypes);

export function MarketingFormVisibilityEditor({ form, index }: { form: UseFormReturn<MarketingFormInput>; index: number }) {
  const fields = form.watch("fields");
  const field = fields[index];
  const rules = field.validationRules ?? {};
  const enabled = rules.visibility !== undefined;
  const raw = rules.visibility && typeof rules.visibility === "object" ? rules.visibility as Partial<MarketingFormVisibility> : {};
  const parents = fields.filter((item, position) => position !== index && item.isActive !== false && Boolean(item.fieldKey) && parentTypes.has(item.fieldType));
  const parent = parents.find(item => item.fieldKey === raw.parentFieldKey);
  const operator = marketingFormVisibilityOperators.includes(raw.operator!) ? raw.operator! : "is_not_empty";
  const choices = normalizeMarketingFormOptions(parent?.options);
  let type = "lead_form";
  try { type = marketingFormPublicationType(form.watch("formType") ?? "lead_form", form.watch("duplicateSettings")); }
  catch { /* Policy errors are handled by the processing panel/API; keep this editor usable. */ }
  const issues = validateMarketingFormVisibility(fields, type).filter(issue => issue.path[1] === index);
  function setCondition(condition: Partial<MarketingFormVisibility> | null) {
    const next = { ...form.getValues(`fields.${index}.validationRules`) };
    if (condition) next.visibility = condition;
    else delete next.visibility;
    form.setValue(`fields.${index}.validationRules`, next, { shouldDirty: true });
    form.clearErrors(`fields.${index}.validationRules`);
  }
  return <FieldSet className="col-span-full min-w-0 rounded-md border p-3">
    <FieldLegend variant="label">Điều kiện hiện câu hỏi</FieldLegend>
    <FieldGroup className="gap-3">
      <Field orientation="horizontal" data-disabled={!enabled && !parents.length}><Checkbox id={`visibility-enabled-${index}`} checked={enabled} disabled={!enabled && !parents.length} onCheckedChange={checked => setCondition(checked === true ? { parentFieldKey: parents[0]?.fieldKey, operator: "is_not_empty" } : null)} /><FieldLabel htmlFor={`visibility-enabled-${index}`}>Chỉ hiện câu hỏi khi thỏa điều kiện</FieldLabel></Field>
      <FieldDescription>Câu bị ẩn không bắt buộc, đáp án cũ được xóa và không gửi CRM. Không thể ẩn Họ tên/Số điện thoại khi form tạo Lead. Mỗi câu hỏi hỗ trợ một điều kiện; không dùng biểu thức hoặc mã JavaScript.</FieldDescription>
      {!parents.length && <p className="text-sm text-muted-foreground">Cần có câu hỏi khác phù hợp để chọn làm câu hỏi cha.</p>}
      {enabled && <VisibilityControls index={index} raw={raw} parents={parents} choices={choices} operator={operator} multiple={["checkbox", "multi_select"].includes(parent?.fieldType ?? "")} invalid={issues.length > 0} setCondition={setCondition} />}
      <FieldError id={`visibility-error-${index}`}>{issues.map(issue => issue.message).join(" ") || undefined}</FieldError>
    </FieldGroup>
  </FieldSet>;
}
function VisibilityControls({ index, raw, parents, choices, operator, multiple, invalid, setCondition }: {
  index: number; raw: Partial<MarketingFormVisibility>; parents: MarketingFormField[]; choices: Array<{ value: string; label: string }>;
  operator: MarketingFormVisibility["operator"]; multiple: boolean; invalid: boolean; setCondition: (condition: Partial<MarketingFormVisibility>) => void;
}) {
  const needsValue = !["is_empty", "is_not_empty"].includes(operator);
  return <>
        <Field data-invalid={invalid}><FieldLabel htmlFor={`visibility-parent-${index}`}>Câu hỏi cha</FieldLabel><Select value={raw.parentFieldKey || "__none__"} onValueChange={value => setCondition({ parentFieldKey: value, operator: "is_not_empty" })}><SelectTrigger id={`visibility-parent-${index}`} className="w-full" aria-invalid={invalid} aria-describedby={`visibility-error-${index}`}><SelectValue placeholder="Chọn câu hỏi cha" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__" disabled>Chọn câu hỏi cha</SelectItem>{parents.map(item => <SelectItem key={item.fieldKey} value={item.fieldKey}>{item.label} ({item.fieldKey})</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor={`visibility-operator-${index}`}>Điều kiện</FieldLabel><Select value={operator} onValueChange={value => setCondition({ parentFieldKey: raw.parentFieldKey, operator: value as MarketingFormVisibility["operator"], ...(!["is_empty", "is_not_empty"].includes(value) ? { value: choices[0]?.value ?? "" } : {}) })}><SelectTrigger id={`visibility-operator-${index}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{marketingFormVisibilityOperators.filter(item => !multiple || !["equals", "not_equals"].includes(item)).map(item => <SelectItem key={item} value={item}>{labels[item]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        {needsValue && <Field data-invalid={invalid}><FieldLabel htmlFor={`visibility-value-${index}`}>Giá trị so sánh</FieldLabel>{choices.length ? <Select value={raw.value || "__none__"} onValueChange={value => setCondition({ ...raw, value })}><SelectTrigger id={`visibility-value-${index}`} className="w-full" aria-invalid={invalid}><SelectValue placeholder="Chọn đáp án" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none__" disabled>Chọn đáp án</SelectItem>{choices.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : <Input id={`visibility-value-${index}`} maxLength={1000} value={raw.value ?? ""} aria-invalid={invalid} onChange={event => setCondition({ ...raw, value: event.target.value })} />}</Field>}
      </>;
}
