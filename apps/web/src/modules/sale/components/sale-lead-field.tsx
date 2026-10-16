import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
type SaleLeadFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  leads: Array<{ id: string; fullName: string; leadCode: string | null }>;
  disabled: boolean;
  error?: { message?: string };
};

export function SaleLeadField({
  id,
  value,
  onChange,
  leads,
  disabled,
  error,
}: SaleLeadFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Lead *</FieldLabel>
      <Select disabled={disabled} value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Chọn lead" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {leads.map((lead) => (
              <SelectItem key={lead.id} value={lead.id}>
                {lead.fullName}
                {lead.leadCode ? ` (${lead.leadCode})` : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError errors={[error]} />
    </Field>
  );
}
