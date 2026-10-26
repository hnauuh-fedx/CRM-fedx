import { sourceGroupCodes, sourceGroupLabels, type SourceGroupCode } from "@admission-crm/shared/source-group";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { id: string; value: unknown; onChange: (value: SourceGroupCode | "auto") => void; error?: string };
export function SourceGroupField({ id, value, onChange, error }: Props) {
  const selected = typeof value === "string" && sourceGroupCodes.includes(value as SourceGroupCode) ? value : "auto";
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Nhóm nguồn khách hàng</FieldLabel>
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11 w-full" aria-invalid={Boolean(error)} aria-describedby={`${id}-description`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="auto">Tự động theo UTM / trang giới thiệu</SelectItem>
            {sourceGroupCodes.map(code => <SelectItem key={code} value={code}>{sourceGroupLabels[code]}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription id={`${id}-description`}>
        Chọn nhóm cố định cho một kênh. Với nhiều kênh, chọn Tự động: ưu tiên UTM, sau đó trang giới thiệu; không xác định thì dùng Khác.
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
