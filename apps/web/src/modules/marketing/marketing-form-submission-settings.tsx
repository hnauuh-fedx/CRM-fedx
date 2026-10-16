import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { marketingFormUpdateFields } from "@admission-crm/shared/marketing-form-submission-policy";
import type { UseFormReturn } from "react-hook-form";
import type { MarketingFormInput } from "./marketing-reference.types";

const fieldLabels = {
  email: "Email",
  major_id: "Ngành đăng ký",
  gender: "Giới tính",
  date_of_birth: "Ngày sinh",
  note: "Ghi chú",
};
export function MarketingFormSubmissionSettings({
  form,
  onModeChange,
}: {
  form: UseFormReturn<MarketingFormInput>;
  onModeChange?: () => void;
}) {
  const settings = form.watch("duplicateSettings") ?? {};
  const mode =
    typeof settings.submissionMode === "string"
      ? settings.submissionMode
      : "legacy";
  const update = (patch: Record<string, unknown>) =>
    form.setValue(
      "duplicateSettings",
      { ...settings, ...patch },
      { shouldDirty: true, shouldValidate: true },
    );
  const selected = Array.isArray(settings.overwriteFields)
    ? settings.overwriteFields
    : [];
  const selectedFields = new Set(selected);
  return (
    <FieldGroup>
      <Field
        data-invalid={Boolean(
          form.formState.errors.duplicateSettings?.submissionMode,
        )}
      >
        <FieldLabel htmlFor="form-submission-mode">Xử lý phản hồi</FieldLabel>
        <Select
          value={mode}
          onValueChange={(value) => {
            onModeChange?.();
            update({
              submissionMode: value,
              submissionPolicyVersion: 1,
              updatePolicy: "fill_empty",
              overwriteFields: [],
            });
          }}
        >
          <SelectTrigger
            id="form-submission-mode"
            className="w-full"
            aria-invalid={Boolean(
              form.formState.errors.duplicateSettings?.submissionMode,
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="legacy">
                Giữ hành vi cũ (chưa chuyển đổi)
              </SelectItem>
              <SelectItem value="survey_only">
                Chỉ lưu câu trả lời khảo sát
              </SelectItem>
              <SelectItem value="create_lead">
                Tạo Lead mới; trùng thì chỉ liên kết phản hồi
              </SelectItem>
              <SelectItem value="upsert_lead">
                Tạo mới hoặc bổ sung Lead trùng
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {mode === "legacy"
            ? "Không thay đổi cách tạo, cập nhật và gán Sale của form hiện tại."
            : mode === "survey_only"
              ? "Ví dụ: có họ tên và điện thoại vẫn chỉ lưu khảo sát, không tạo hoặc sửa Lead."
              : "Lead mới chưa có Sale. Lead trùng chỉ xét trong chương trình; không thay người phụ trách. Chọn chế độ và bấm Lưu là xác nhận chuyển hành vi cho phản hồi mới. Automation được nối ở giai đoạn G6."}
        </FieldDescription>
        <FieldError
          errors={[
            form.formState.errors.duplicateSettings?.submissionMode as {
              message?: string;
            },
          ]}
        />
      </Field>
      {mode === "upsert_lead" && (
        <>
          <Field>
            <FieldLabel htmlFor="form-update-policy">Khi trùng Lead</FieldLabel>
            <Select
              value={String(settings.updatePolicy ?? "fill_empty")}
              onValueChange={(value) => update({ updatePolicy: value })}
            >
              <SelectTrigger id="form-update-policy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="fill_empty">
                    Chỉ bổ sung trường đang trống
                  </SelectItem>
                  <SelectItem value="overwrite_selected">
                    Cho phép ghi đè trường được tích chọn
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Ví dụ: Email đã có được giữ nguyên, trừ khi bạn cho phép ghi đè
              Email. Không sửa họ tên, điện thoại, Sale, chương trình hoặc trạng
              thái tuyển sinh.
            </FieldDescription>
          </Field>
          {settings.updatePolicy === "overwrite_selected" && (
            <FieldGroup>
              {marketingFormUpdateFields.map((field) => (
                <Field key={field} orientation="horizontal">
                  <Checkbox
                    id={`form-overwrite-${field}`}
                    checked={selectedFields.has(field)}
                    onCheckedChange={(checked) =>
                      update({
                        overwriteFields: checked
                          ? [...selected, field]
                          : selected.filter((item) => item !== field),
                      })
                    }
                  />
                  <FieldLabel htmlFor={`form-overwrite-${field}`}>
                    {fieldLabels[field]}
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          )}
        </>
      )}
    </FieldGroup>
  );
}
