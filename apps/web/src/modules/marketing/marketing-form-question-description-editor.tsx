import type { UseFormReturn } from "react-hook-form";
import { validateMarketingFormQuestionDescriptions } from "@admission-crm/shared/marketing-form-config";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { MarketingFormInput } from "./marketing-reference.types";

export function MarketingFormQuestionDescriptionEditor({ form, index }: { form: UseFormReturn<MarketingFormInput>; index: number }) {
  const rules = form.watch(`fields.${index}.validationRules`) ?? {};
  const value = typeof rules.questionDescription === "string" ? rules.questionDescription : "";
  const message = validateMarketingFormQuestionDescriptions(form.watch("fields")).find(issue => issue.path[1] === index)?.message;
  const id = `marketing-question-description-${index}`;
  return <Field className="sm:col-span-2" data-invalid={Boolean(message)}>
    <FieldLabel htmlFor={id}>Mô tả / hướng dẫn câu hỏi</FieldLabel>
    <Textarea id={id} rows={3} maxLength={1000} value={value} aria-invalid={Boolean(message)} aria-describedby={`${id}-hint ${id}-error`} onChange={event => {
      const next = { ...form.getValues(`fields.${index}.validationRules`) };
      if (event.target.value) next.questionDescription = event.target.value;
      else delete next.questionDescription;
      form.clearErrors(`fields.${index}.validationRules`);
      form.setValue(`fields.${index}.validationRules`, next, { shouldDirty: true, shouldValidate: true });
    }} />
    <FieldDescription id={`${id}-hint`}>Hiển thị cùng câu hỏi khi điền form. Văn bản thuần, tối đa 1.000 ký tự; không ghi vào Lead.</FieldDescription>
    <FieldError id={`${id}-error`}>{message}</FieldError>
  </Field>;
}
