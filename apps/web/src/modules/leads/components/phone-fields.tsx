import { Info } from "lucide-react";
import type { ComponentProps } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LeadFormInput } from "../lead.types";
import { nonStandardPhoneClass } from "./lead-phone";

const nonStandardPhoneMessage = "Số màu tím chưa đúng định dạng 10 chữ số bắt đầu bằng 0.";

/** Phone input that shows the format hint as an "i" tooltip only while the number is non-standard. */
function PhoneInput({ value, className, ...props }: ComponentProps<typeof Input> & { value: string }) {
  const nonStandardClass = nonStandardPhoneClass(value);
  return (
    <div className="relative w-full">
      <Input {...props} className={cn(nonStandardClass, nonStandardClass && "pr-9", className)} />
      {nonStandardClass && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-purple-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-purple-400"
              aria-label={nonStandardPhoneMessage}
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{nonStandardPhoneMessage}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function PhoneFields({ form, label, disabled = false }: { form: UseFormReturn<LeadFormInput>; label: string; disabled?: boolean }) {
  const phone = form.watch("phone") ?? "";
  const secondaryPhones = form.watch("secondaryPhones") ?? [];
  const errors = form.formState.errors;
  return (
    <Field data-invalid={Boolean(errors.phone)}>
      <FieldLabel htmlFor="lead-phone">{label}</FieldLabel>
      <div className="flex items-center gap-1">
        <PhoneInput value={phone} disabled={disabled} id="lead-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="Nhập đúng 10 chữ số" aria-invalid={Boolean(errors.phone)} {...form.register("phone")} />
      </div>
      <FieldError errors={[errors.phone]} />
      {secondaryPhones.map((secondaryPhone, index) => (
        <div key={index} className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <PhoneInput value={secondaryPhone} disabled={disabled} type="tel" inputMode="numeric" aria-label={`Số điện thoại ${index + 2}`} aria-invalid={Boolean(errors.secondaryPhones?.[index])} {...form.register(`secondaryPhones.${index}`)} />
          </div>
          <FieldError errors={[errors.secondaryPhones?.[index]]} />
        </div>
      ))}
    </Field>
  );
}
