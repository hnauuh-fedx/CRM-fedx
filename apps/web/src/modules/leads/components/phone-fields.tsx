import type { UseFormReturn } from "react-hook-form";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LeadFormInput } from "../lead.types";
import { CopyPhoneButton, nonStandardPhoneClass } from "./lead-phone";

export function PhoneFields({ form, label, disabled = false }: { form: UseFormReturn<LeadFormInput>; label: string; disabled?: boolean }) {
  const phone = form.watch("phone") ?? "";
  const secondaryPhones = form.watch("secondaryPhones") ?? [];
  const errors = form.formState.errors;
  const hasNonStandard = [phone, ...secondaryPhones].some((item) => nonStandardPhoneClass(item));
  return (
    <Field data-invalid={Boolean(errors.phone)}>
      <FieldLabel htmlFor="lead-phone">{label}</FieldLabel>
      <div className="flex items-center gap-1">
        <Input disabled={disabled} id="lead-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="Nhập đúng 10 chữ số" aria-invalid={Boolean(errors.phone)} className={nonStandardPhoneClass(phone)} {...form.register("phone")} />
        {phone.trim() && <CopyPhoneButton phone={phone.trim()} />}
      </div>
      <FieldError errors={[errors.phone]} />
      {secondaryPhones.map((secondaryPhone, index) => (
        <div key={index} className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Input disabled={disabled} type="tel" inputMode="numeric" aria-label={`Số điện thoại ${index + 2}`} aria-invalid={Boolean(errors.secondaryPhones?.[index])} className={nonStandardPhoneClass(secondaryPhone)} {...form.register(`secondaryPhones.${index}`)} />
            {secondaryPhone.trim() && <CopyPhoneButton phone={secondaryPhone.trim()} />}
          </div>
          <FieldError errors={[errors.secondaryPhones?.[index]]} />
        </div>
      ))}
      {hasNonStandard && <FieldDescription className="text-purple-600 dark:text-purple-400">Số màu tím chưa đúng định dạng 10 chữ số bắt đầu bằng 0.</FieldDescription>}
    </Field>
  );
}
