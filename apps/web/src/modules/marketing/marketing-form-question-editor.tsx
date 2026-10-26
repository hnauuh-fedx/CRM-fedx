import type { UseFormReturn } from "react-hook-form";
import { GroupedFieldPicker } from "@/components/shared/grouped-field-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MarketingFormFieldType, MarketingFormFilterOptions, MarketingFormInput, MarketingFormLeadField } from "./marketing-reference.types";
import { leadFieldLabels, fieldTypeLabels, marketingLeadFieldOptions, optionFieldTypes } from "./marketing-form-editor-config";
import { ChoiceOptionsEditor } from "./marketing-form-choice-options-editor";
import { MarketingFormVisibilityEditor } from "./marketing-form-visibility-editor";
import { MarketingFormQuestionDescriptionEditor } from "./marketing-form-question-description-editor";
import { MarketingFormRatingEditor } from "./marketing-form-rating-editor";
import { MarketingFormOtherEditor } from "./marketing-form-other-editor";

export function FormFieldRow({ index, form, options, onMoveUp, onMoveDown, onRemove, canMoveUp, canMoveDown, canRemove, defaultOpen = false }: {
  index: number;
  form: UseFormReturn<MarketingFormInput>;
  options?: MarketingFormFilterOptions;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  defaultOpen?: boolean;
}) {
  const fieldType = form.watch(`fields.${index}.fieldType`);
  const label = form.watch(`fields.${index}.label`) || `Trường ${index + 1}`;
  const fieldKey = form.watch(`fields.${index}.fieldKey`) || "chưa có mã";
  const mapping = form.watch(`fields.${index}.crmMappingField`) ?? form.watch(`fields.${index}.leadField`);
  return (
    <details className="rounded-md border bg-background" open={defaultOpen}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 basis-32 break-words">
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{fieldKey}</p>
        </div>
        <Badge variant="secondary">{fieldTypeLabels[fieldType]}</Badge>
        <span className="text-sm text-muted-foreground">{mapping ? `CRM: ${leadFieldLabels[mapping]}` : "Chỉ lưu câu trả lời"}</span>
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={!canMoveUp} onClick={(event) => { event.preventDefault(); onMoveUp(); }} aria-label={`Đưa trường ${index + 1} lên`}><ArrowUp aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" disabled={!canMoveDown} onClick={(event) => { event.preventDefault(); onMoveDown(); }} aria-label={`Đưa trường ${index + 1} xuống`}><ArrowDown aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" disabled={!canRemove} onClick={(event) => { event.preventDefault(); onRemove(); }} aria-label={`Xóa trường ${index + 1}`}><Trash2 aria-hidden="true" /></Button>
        </div>
      </summary>
      <div className="grid min-w-0 items-end gap-3 border-t bg-muted/30 p-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field data-invalid={Boolean(form.formState.errors.fields?.[index]?.fieldKey)}>
          <FieldLabel htmlFor={`marketing-field-key-${index}`}>Mã trường *</FieldLabel>
          <Input id={`marketing-field-key-${index}`} placeholder="phone" aria-invalid={Boolean(form.formState.errors.fields?.[index]?.fieldKey)} {...form.register(`fields.${index}.fieldKey`)} />
          <FieldError errors={[form.formState.errors.fields?.[index]?.fieldKey]} />
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.fields?.[index]?.label)}>
          <FieldLabel htmlFor={`marketing-field-label-${index}`}>Nhãn *</FieldLabel>
          <Input id={`marketing-field-label-${index}`} placeholder="Số điện thoại" aria-invalid={Boolean(form.formState.errors.fields?.[index]?.label)} {...form.register(`fields.${index}.label`)} />
          <FieldError errors={[form.formState.errors.fields?.[index]?.label]} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`marketing-field-type-${index}`}>Kiểu</FieldLabel>
          <Select value={fieldType} onValueChange={(value) => form.setValue(`fields.${index}.fieldType`, value as MarketingFormFieldType, { shouldDirty: true, shouldValidate: true })}>
            <SelectTrigger id={`marketing-field-type-${index}`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(fieldTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.fields?.[index]?.crmMappingField)}>
          <FieldLabel htmlFor={`marketing-field-lead-${index}`}>Lưu dữ liệu vào</FieldLabel>
          <GroupedFieldPicker
            id={`marketing-field-lead-${index}`}
            value={form.watch(`fields.${index}.crmMappingField`) ?? form.watch(`fields.${index}.leadField`) ?? "__none__"}
            options={marketingLeadFieldOptions(options?.leadFields ?? Object.keys(leadFieldLabels) as MarketingFormLeadField[], { value: "__none__", label: "Chỉ lưu câu trả lời" }, "CRM: ")}
            aria-invalid={Boolean(form.formState.errors.fields?.[index]?.crmMappingField)}
            onChange={(value) => {
              const nextValue = value === "__none__" ? null : value as MarketingFormLeadField;
              form.setValue(`fields.${index}.crmMappingField`, nextValue, { shouldDirty: true, shouldValidate: true });
              form.setValue(`fields.${index}.leadField`, nextValue, { shouldDirty: true, shouldValidate: true });
            }}
          />
          <FieldError errors={[form.formState.errors.fields?.[index]?.crmMappingField]} />
          <p className="text-xs text-muted-foreground">{mapping ? "Ghi câu trả lời vào trường CRM đã chọn. Ngành/nguồn cần mã CRM hợp lệ." : "Lưu đáp án khảo sát, không thay đổi trường CRM dù mã câu hỏi trùng tên trường CRM."}</p>
        </Field>
        <label htmlFor={`marketing-field-required-${index}`} className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox id={`marketing-field-required-${index}`} checked={form.watch(`fields.${index}.isRequired`)} onCheckedChange={(checked) => form.setValue(`fields.${index}.isRequired`, Boolean(checked), { shouldDirty: true, shouldValidate: true })} />
          Bắt buộc
        </label>
        <Field className="col-span-full">
          <FieldLabel htmlFor={`marketing-field-placeholder-${index}`}>Gợi ý nhập</FieldLabel>
          <Input id={`marketing-field-placeholder-${index}`} placeholder="Gợi ý nhập liệu" {...form.register(`fields.${index}.placeholder`)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`marketing-field-default-${index}`}>Giá trị mặc định</FieldLabel>
          <Input id={`marketing-field-default-${index}`} placeholder="utm_source..." {...form.register(`fields.${index}.defaultValue`)} />
        </Field>
        <Field className="col-span-full">
          <FieldLabel htmlFor={`marketing-field-validation-${index}`}>Quy tắc kiểm tra (JSON)</FieldLabel>
          <Input id={`marketing-field-validation-${index}`} placeholder='Ví dụ: {"minLength":8}' onChange={(event) => {
            try {
              form.setValue(`fields.${index}.validationRules`, event.target.value.trim() ? JSON.parse(event.target.value) : {}, { shouldDirty: true, shouldValidate: true });
            } catch {
              form.setValue(`fields.${index}.validationRules`, { raw: event.target.value }, { shouldDirty: true, shouldValidate: true });
            }
          }} />
        </Field>
        {optionFieldTypes.has(fieldType) && <ChoiceOptionsEditor index={index} form={form} fieldType={fieldType} />}
        <MarketingFormVisibilityEditor form={form} index={index} />
        <MarketingFormQuestionDescriptionEditor form={form} index={index} />
        {fieldType === "rating" && <MarketingFormRatingEditor form={form} index={index} />}
        {(["radio", "select", "single_select"].includes(fieldType) || form.watch(`fields.${index}.validationRules`)?.allowOther !== undefined) && <MarketingFormOtherEditor form={form} index={index} />}
      </div>
    </details>
  );
}
