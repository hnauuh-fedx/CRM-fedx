import type { UseFormReturn } from "react-hook-form";
import { allowsMarketingFormOther, validateMarketingFormOther } from "@admission-crm/shared/marketing-form-config";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import type { MarketingFormInput } from "./marketing-reference.types";

export function MarketingFormOtherEditor({ form, index }: { form: UseFormReturn<MarketingFormInput>; index: number }) {
  const fields = form.watch("fields");
  const field = fields[index];
  const enabled = allowsMarketingFormOther(field.validationRules);
  const issues = validateMarketingFormOther(fields).filter(issue => issue.path[1] === index);
  const id = `marketing-other-${index}`;
  const disabled = !enabled && Boolean(field.crmMappingField || field.leadField);
  return <Field className="col-span-full min-w-0" data-disabled={disabled} data-invalid={issues.length > 0}>
    <Field orientation="horizontal"><Checkbox id={id} checked={enabled} disabled={disabled} aria-describedby={`${id}-hint ${id}-error`} onCheckedChange={checked => {
      const rules = { ...form.getValues(`fields.${index}.validationRules`) };
      if (checked === true) rules.allowOther = true;
      else delete rules.allowOther;
      form.clearErrors(`fields.${index}.validationRules`);
      form.setValue(`fields.${index}.validationRules`, rules, { shouldDirty: true, shouldValidate: true });
    }} /><FieldLabel htmlFor={id}>Cho phép chọn Khác và nhập nội dung</FieldLabel></Field>
    <FieldDescription id={`${id}-hint`}>Chỉ hỗ trợ câu hỏi chọn một đáp án, không mapping CRM hoặc tham gia chuỗi phụ thuộc. Nội dung Khác tối đa 1.000 ký tự.</FieldDescription>
    <FieldError id={`${id}-error`}>{issues.map(issue => issue.message).join(" ") || undefined}</FieldError>
  </Field>;
}
