import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type IntegrationProgramFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  programs?: { id: string; name: string; institutionName: string }[];
  description: string;
};

export function IntegrationProgramField({
  value,
  onValueChange,
  programs,
  description,
}: IntegrationProgramFieldProps) {
  return (
    <Field>
      <FieldLabel>Chương trình tuyển sinh</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full" aria-required="true">
          <SelectValue placeholder="Chọn chương trình tuyển sinh" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {programs?.map((program) => (
              <SelectItem key={program.id} value={program.id}>
                {program.institutionName} / {program.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}
