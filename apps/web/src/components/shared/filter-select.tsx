import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FilterSelectProps = {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  active?: boolean;
};

const allValue = "__all__";

export function FilterSelect({ id, label, value, options, onChange, active = false }: FilterSelectProps) {
  return (
    <Field className="gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value || allValue} onValueChange={(next) => onChange(next === allValue ? "" : next)}>
        <SelectTrigger id={id} className={cn("w-full", active && "border-primary/40 bg-primary/5")} aria-label={label}>
          <SelectValue placeholder="Tất cả" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={allValue}>Tất cả</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
