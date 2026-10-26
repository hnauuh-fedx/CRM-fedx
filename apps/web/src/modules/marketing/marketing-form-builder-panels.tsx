import { SourceGroupField } from "./source-group-field";
import type { UseFormReturn } from "react-hook-form";
import { resolveMarketingFormRedirect } from "@admission-crm/shared/marketing-form-embed";
import { GroupedFieldPicker } from "@/components/shared/grouped-field-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { marketingLeadFieldOptions } from "./marketing-form-editor-config";
import { MarketingFormSubmissionSettings } from "./marketing-form-submission-settings";
import type { MarketingFormInput, MarketingFormLeadField } from "./marketing-reference.types";

export function MarketingFormCrmPanel({ form, targets }: { form: UseFormReturn<MarketingFormInput>; targets: MarketingFormLeadField[] }) {
  const fields = form.watch("fields");
  const targetOptions = marketingLeadFieldOptions(targets, { value: "survey", label: "Chỉ lưu câu trả lời khảo sát" }, "CRM: ");
  return <FieldGroup className="p-5">
    <SourceGroupField id="marketing-form-source-group" value={form.watch("advancedSettings")?.sourceGroup}
      onChange={sourceGroup => form.setValue("advancedSettings", { ...form.getValues("advancedSettings"), sourceGroup }, { shouldDirty: true, shouldValidate: true })}
      error={form.formState.errors.advancedSettings?.sourceGroup?.message as string | undefined} />
    <p className="text-sm text-muted-foreground">Mỗi câu hỏi luôn giữ câu trả lời khảo sát. Chỉ chọn trường CRM nếu muốn ghi vào Lead theo chế độ xử lý đã lưu.</p>{fields.map((field, index) => {
    const error = form.formState.errors.fields?.[index]?.crmMappingField;
    return <Field key={field.fieldKey} data-invalid={Boolean(error)}><FieldLabel htmlFor={`crm-target-${index}`}>{index + 1}. {field.label}</FieldLabel><GroupedFieldPicker id={`crm-target-${index}`} value={field.crmMappingField ?? field.leadField ?? "survey"} options={targetOptions} aria-invalid={Boolean(error)} onChange={value => {
      const target = value === "survey" ? null : value as MarketingFormLeadField;
      form.setValue(`fields.${index}.crmMappingField`, target, { shouldDirty: true, shouldValidate: true });
      form.setValue(`fields.${index}.leadField`, target, { shouldDirty: true, shouldValidate: true });
    }} /><FieldError errors={[error]} /></Field>;
  })}</FieldGroup>;
}

export function MarketingFormProcessingPanel({ form }: { form: UseFormReturn<MarketingFormInput> }) {
  const settings = form.watch("displaySettings") ?? {};
  const success = form.watch("successSettings") ?? {};
  const redirectValue = typeof success.redirectUrl === "string" ? success.redirectUrl.trim() : "";
  const configuredOrigin = String(import.meta.env.VITE_PUBLIC_WEB_URL ?? (import.meta.env.PROD ? "" : window.location.origin)).trim();
  const redirectInvalid = Boolean(redirectValue) && (() => {
    try { return !configuredOrigin || !resolveMarketingFormRedirect(success, new URL(configuredOrigin).origin); }
    catch { return true; }
  })();
  const allowedOrigins = Array.isArray(success.redirectAllowedOrigins) ? success.redirectAllowedOrigins.filter((item): item is string => typeof item === "string") : [];
  const originsInvalid = allowedOrigins.some(item => {
    try { const url = new URL(item); return url.protocol !== "https:" || url.origin !== item; }
    catch { return true; }
  });
  return <FieldGroup className="p-5"><MarketingFormSubmissionSettings form={form} />
    <Field orientation="horizontal"><Checkbox id="confirm-before-submit" checked={settings.confirmBeforeSubmit === true} onCheckedChange={checked => form.setValue("displaySettings", { ...settings, confirmBeforeSubmit: checked === true }, { shouldDirty: true })} /><FieldLabel htmlFor="confirm-before-submit">Cho người điền kiểm tra câu trả lời trước khi gửi</FieldLabel></Field>
    <Field><FieldLabel htmlFor="success-message">Lời cảm ơn sau khi gửi</FieldLabel><Textarea id="success-message" maxLength={2000} value={typeof success.message === "string" ? success.message : ""} onChange={event => form.setValue("successSettings", { ...success, message: event.target.value }, { shouldDirty: true })} /><FieldDescription>Không đưa thông tin Lead hoặc kết quả kiểm tra trùng vào thông báo công khai.</FieldDescription></Field>
    <Field><FieldLabel htmlFor="redirect-mode">Vị trí chuyển hướng sau khi gửi</FieldLabel><Select value={success.redirectMode === "landing_page" ? "landing_page" : "form"} onValueChange={value => form.setValue("successSettings", { ...success, redirectMode: value }, { shouldDirty: true })}><SelectTrigger id="redirect-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="form">Trong form/iframe</SelectItem><SelectItem value="landing_page">Toàn bộ landing page</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>Chuyển landing page chỉ tự động khi dùng snippet bảo mật; iframe tĩnh vẫn tương thích nhưng không điều hướng trang cha.</FieldDescription></Field>
    <Field data-invalid={redirectInvalid}><FieldLabel htmlFor="redirect-url">URL chuyển hướng</FieldLabel><Input id="redirect-url" type="text" inputMode="url" aria-invalid={redirectInvalid} value={typeof success.redirectUrl === "string" ? success.redirectUrl : ""} onChange={event => form.setValue("successSettings", { ...success, redirectUrl: event.target.value }, { shouldDirty: true, shouldValidate: true })} placeholder="https://example.edu.vn/cam-on hoặc /cam-on" /><FieldDescription>Dùng HTTPS. Đường dẫn tương đối chỉ chuyển trong website CRM.</FieldDescription>{redirectInvalid && <FieldError errors={[{ message: "URL chuyển hướng phải an toàn và thuộc origin được cho phép." }]} />}</Field>
    <Field data-invalid={originsInvalid}><FieldLabel htmlFor="redirect-origins">Domain chuyển hướng ngoài CRM</FieldLabel><Textarea id="redirect-origins" rows={3} aria-invalid={originsInvalid} value={allowedOrigins.join("\n")} onChange={event => form.setValue("successSettings", { ...success, redirectAllowedOrigins: event.target.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) }, { shouldDirty: true, shouldValidate: true })} placeholder="https://example.edu.vn" /><FieldDescription>Mỗi dòng một origin HTTPS, không nhập đường dẫn. URL chuyển hướng ngoài CRM phải thuộc danh sách này.</FieldDescription>{originsInvalid && <FieldError errors={[{ message: "Mỗi dòng phải là một origin HTTPS, không có đường dẫn." }]} />}</Field>
  </FieldGroup>;
}

export function MarketingFormSharePanel({ publicUrl, iframeCode, embedSnippet, onCopy }: { publicUrl: string; iframeCode: string; embedSnippet: string; onCopy: (text: string) => void }) {
  return <FieldGroup className="p-5"><p className="text-sm text-muted-foreground">Link công khai nhận phản hồi thật khi form đang xuất bản. Để thử mà không ghi CRM, dùng nút “Điền thử”.</p>
    {!publicUrl && <p role="alert" className="text-sm text-destructive">Chưa thể tạo mã nhúng an toàn. Production cần cấu hình VITE_PUBLIC_WEB_URL bằng HTTPS và không dùng localhost.</p>}
    <Field><FieldLabel htmlFor="share-public-url">Link biểu mẫu</FieldLabel><Input id="share-public-url" readOnly value={publicUrl} /><Button type="button" variant="outline" disabled={!publicUrl} onClick={() => onCopy(publicUrl)}>Sao chép link</Button></Field>
    <Field><FieldLabel htmlFor="share-iframe">Mã iframe</FieldLabel><Textarea id="share-iframe" readOnly rows={5} value={iframeCode} /><Button type="button" variant="outline" disabled={!iframeCode} onClick={() => onCopy(iframeCode)}>Sao chép iframe</Button></Field>
    <Field><FieldLabel htmlFor="share-snippet">Snippet tự đổi chiều cao và nhận UTM</FieldLabel><Textarea id="share-snippet" readOnly rows={7} value={embedSnippet} /><FieldDescription>Snippet kiểm tra origin, cửa sổ gửi và form ID trước khi nhận tracking, resize hoặc chuyển hướng landing page.</FieldDescription><Button type="button" variant="outline" disabled={!embedSnippet} onClick={() => onCopy(embedSnippet)}>Sao chép snippet</Button></Field>
  </FieldGroup>;
}
