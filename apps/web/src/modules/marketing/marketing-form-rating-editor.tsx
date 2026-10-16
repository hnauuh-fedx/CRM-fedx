import type { UseFormReturn } from "react-hook-form";
import { validateMarketingFormRatings } from "@admission-crm/shared/marketing-form-config";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MarketingFormInput } from "./marketing-reference.types";

export function MarketingFormRatingEditor({ form, index }: { form: UseFormReturn<MarketingFormInput>; index: number }) {
  const rules = form.watch(`fields.${index}.validationRules`) ?? {};
  const issue = validateMarketingFormRatings(form.watch("fields")).find(item => item.path[1] === index);
  const id = `marketing-rating-max-${index}`;
  return <Field className="sm:col-span-2" data-invalid={Boolean(issue)}>
    <FieldLabel htmlFor={id}>Số sao tối đa</FieldLabel>
    <Input id={id} type="number" min={2} max={10} step={1} value={typeof rules.ratingMax === "number" ? rules.ratingMax : "ratingMax" in rules ? "" : 5} aria-invalid={Boolean(issue)} aria-describedby={`${id}-hint ${id}-error`} onChange={event => {
      form.clearErrors(`fields.${index}.validationRules`);
      form.setValue(`fields.${index}.validationRules`, { ...form.getValues(`fields.${index}.validationRules`), ratingMax: event.target.value === "" ? null : Number(event.target.value) }, { shouldDirty: true, shouldValidate: true });
    }} />
    <FieldDescription id={`${id}-hint`}>Từ 2 đến 10 sao, mặc định 5. Điểm đánh giá chỉ lưu trong phản hồi khảo sát.</FieldDescription>
    <FieldError id={`${id}-error`}>{issue?.message}</FieldError>
  </Field>;
}
