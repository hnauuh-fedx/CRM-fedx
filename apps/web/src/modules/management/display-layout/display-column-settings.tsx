import {
  defaultDisplayColumnWidth,
  leadDisplayFields,
  maxDisplayColumnWidth,
  minDisplayColumnWidth,
  type LayoutPresentation,
  type PersonalizationPolicy,
} from "@admission-crm/shared/display-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const labels = new Map(
  leadDisplayFields.map((field) => [field.key, field.label]),
);
export function DisplayColumnSettings({
  presentation,
  disabled,
  canPin = true,
  canResize = true,
  onChange,
}: {
  presentation: LayoutPresentation;
  disabled: boolean;
  canPin?: boolean;
  canResize?: boolean;
  onChange: (presentation: LayoutPresentation) => void;
}) {
  const pinned = new Set(presentation.pinnedFields);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ghim và độ rộng cột</CardTitle>
        <CardDescription>
          Ghim tối đa 3 cột bên trái, sau cột chọn và xem chi tiết. Trên màn
          hình nhỏ hoặc khi không đủ chỗ, các cột dữ liệu cuộn bình thường để dễ
          đọc. Độ rộng từ 120 đến 600 px.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <details>
          <summary className="cursor-pointer rounded-sm py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            Điều chỉnh {presentation.visibleFields.length} cột đang hiển thị
          </summary>
          <div className="mt-3 grid max-h-112 gap-3 overflow-y-auto pr-2 md:grid-cols-2">
            {presentation.visibleFields.map((key) => {
              const width =
                presentation.columnWidths[key] ?? defaultDisplayColumnWidth;
              const invalid =
                !Number.isInteger(width) ||
                width < minDisplayColumnWidth ||
                width > maxDisplayColumnWidth;
              return (
                <FieldSet key={key} className="min-w-0 rounded-md border p-3">
                  <FieldLegend variant="label">
                    {labels.get(key) ?? "Trường đã ngừng sử dụng"}
                  </FieldLegend>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={`pin-column-${key}`}
                      checked={pinned.has(key)}
                      disabled={
                        disabled ||
                        !canPin ||
                        (!pinned.has(key) && pinned.size >= 3)
                      }
                      onCheckedChange={(checked) =>
                        onChange({
                          ...presentation,
                          pinnedFields: checked
                            ? [...presentation.pinnedFields, key]
                            : presentation.pinnedFields.filter(
                                (field) => field !== key,
                              ),
                        })
                      }
                    />
                    <FieldLabel htmlFor={`pin-column-${key}`}>
                      Ghim bên trái
                    </FieldLabel>
                  </Field>
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={`column-width-${key}`}>
                      Độ rộng (px)
                    </FieldLabel>
                    <Input
                      id={`column-width-${key}`}
                      type="number"
                      inputMode="numeric"
                      min={minDisplayColumnWidth}
                      max={maxDisplayColumnWidth}
                      step={1}
                      value={width}
                      aria-invalid={invalid}
                      disabled={disabled || !canResize}
                      onChange={(event) =>
                        onChange({
                          ...presentation,
                          columnWidths: {
                            ...presentation.columnWidths,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                    />
                    {invalid && (
                      <FieldError>Nhập số nguyên từ 120 đến 600.</FieldError>
                    )}
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      disabled ||
                      !canResize ||
                      presentation.columnWidths[key] === undefined
                    }
                    onClick={() => {
                      const widths = { ...presentation.columnWidths };
                      delete widths[key];
                      onChange({ ...presentation, columnWidths: widths });
                    }}
                  >
                    Độ rộng mặc định
                  </Button>
                </FieldSet>
              );
            })}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

const policyLabels: Array<{ key: keyof PersonalizationPolicy; label: string }> =
  [
    { key: "visibility", label: "Ẩn và hiện lại cột trong mẫu được giao" },
    { key: "order", label: "Đổi thứ tự cột" },
    { key: "pinning", label: "Thay đổi cột ghim" },
    { key: "widths", label: "Điều chỉnh độ rộng cột" },
  ];
export function DisplayPersonalizationPolicy({
  policy,
  disabled,
  onChange,
}: {
  policy: PersonalizationPolicy;
  disabled: boolean;
  onChange: (policy: PersonalizationPolicy) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cho phép Sale tùy chỉnh cá nhân</CardTitle>
        <CardDescription>
          Mặc định tắt. Sale chỉ được dùng các cột đang hiển thị trong mẫu này.
          Khi áp dụng phiên bản mới, tùy chỉnh cá nhân cũ được tạm bỏ để dùng
          mẫu quản lý mới nhất.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldSet>
          <FieldLegend className="sr-only">
            Các thao tác được cho phép
          </FieldLegend>
          {policyLabels.map((item) => (
            <Field key={item.key} orientation="horizontal">
              <Checkbox
                id={`personal-policy-${item.key}`}
                checked={policy[item.key]}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({ ...policy, [item.key]: checked === true })
                }
              />
              <FieldLabel htmlFor={`personal-policy-${item.key}`}>
                {item.label}
              </FieldLabel>
            </Field>
          ))}
        </FieldSet>
      </CardContent>
    </Card>
  );
}
