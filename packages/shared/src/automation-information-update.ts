import { z } from "zod";

export const AUTOMATION_INFORMATION_UPDATE_LIMIT = 200;
const fileSchema = z.object({
  name: z.string().trim().min(1).max(255), size: z.number().nonnegative().max(25 * 1024 * 1024),
  type: z.string().max(255), lastModified: z.number().nonnegative(),
  url: z.string().url().refine((url) => /^https?:\/\//i.test(url)),
}).strict();
export type AutomationInformationFile = z.infer<typeof fileSchema>;

export const automationInformationUpdatesSchema = z.array(z.object({
  id: z.string().min(1).max(100).optional(),
  field: z.string().min(1, "Vui lòng chọn trường thông tin."),
  operation: z.enum(["set", "clear"]),
  value: z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string()), z.array(fileSchema)]).optional(),
}).strict()).min(1, "Thêm ít nhất một trường cập nhật.").max(AUTOMATION_INFORMATION_UPDATE_LIMIT, "Tối đa 200 trường trong một node.")
  .superRefine((updates, context) => {
    const seen = new Set<string>();
    updates.forEach((update, index) => {
      if (seen.has(update.field)) context.addIssue({ code: "custom", path: [index, "field"], message: "Trường này đã được chọn." });
      seen.add(update.field);
      if (update.operation === "set" && (update.value === undefined || (typeof update.value === "string" && !update.value.trim()) || (Array.isArray(update.value) && !update.value.length))) {
        context.addIssue({ code: "custom", path: [index, "value"], message: "Nhập giá trị; dùng Xóa giá trị nếu muốn để trống." });
      }
      if (update.operation === "clear" && update.value !== undefined) context.addIssue({ code: "custom", path: [index, "value"], message: "Thao tác xóa không nhận giá trị." });
    });
  });

export type AutomationInformationUpdate = z.infer<typeof automationInformationUpdatesSchema>[number];
export type AutomationWritableField = {
  reference: string;
  key: string;
  label: string;
  description: string | null;
  dataType: string;
  groupKey: string;
  groupLabel: string;
  source: "system" | "custom";
  isSensitive: boolean;
  canClear: boolean;
  options: Array<{ code: string; label: string }>;
  validationRules?: Record<string, unknown>;
  readOnlyReason?: string;
};

/** Shared by the editor, rule validation and execution. No coercion of booleans/numbers. */
export function validateInformationUpdate(update: AutomationInformationUpdate, field: AutomationWritableField): string | undefined {
  if (field.readOnlyReason) return field.readOnlyReason;
  if (update.operation === "clear") return field.canClear ? undefined : "Trường bắt buộc không được xóa giá trị.";
  const value = update.value;
  const rules = field.validationRules ?? {};
  let valid = false;
  switch (field.dataType) {
    case "TEXT": case "TEXTAREA":
      valid = typeof value === "string" && value.trim().length > 0
        && (typeof rules.minLength !== "number" || value.trim().length >= rules.minLength)
        && (typeof rules.maxLength !== "number" || value.trim().length <= rules.maxLength);
      break;
    case "EMAIL": valid = typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 255; break;
    case "PHONE": valid = typeof value === "string" && /^0\d{9}$/.test(value.trim()); break;
    case "NUMBER": valid = typeof value === "number" && Number.isFinite(value)
      && (typeof rules.min !== "number" || value >= rules.min) && (typeof rules.max !== "number" || value <= rules.max)
      && (!rules.integer || Number.isInteger(value))
      && (typeof rules.decimalPlaces !== "number" || Math.abs(value * 10 ** rules.decimalPlaces - Math.round(value * 10 ** rules.decimalPlaces)) < 0.001); break;
    case "BOOLEAN": valid = typeof value === "boolean"; break;
    case "DATE": valid = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; break;
    case "DATETIME": valid = typeof value === "string" && z.string().datetime({ offset: true }).safeParse(value).success; break;
    case "PROVINCE": case "SELECT": valid = typeof value === "string" && field.options.some((option) => option.code === value); break;
    case "MULTI_SELECT": valid = Array.isArray(value) && value.length > 0 && new Set<unknown>(value).size === value.length
      && value.every((item) => field.options.some((option) => option.code === item)); break;
    case "STRING_LIST": valid = Array.isArray(value) && value.length > 0 && new Set(value.map((item) => typeof item === "string" ? item.trim().toLocaleLowerCase("vi") : item)).size === value.length
      && value.length <= Number(rules.maxItems ?? 20)
      && value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= Number(rules.maxLength ?? 255)
        && (!rules.phone || /^0\d{9}$/.test(item))); break;
    case "FILE": valid = Array.isArray(value) && value.length > 0 && value.length <= Number(rules.maxFiles ?? 1)
      && value.every((item) => fileSchema.safeParse(item).success); break;
  }
  return valid ? undefined : "Giá trị không hợp lệ hoặc không còn trong danh sách lựa chọn.";
}
