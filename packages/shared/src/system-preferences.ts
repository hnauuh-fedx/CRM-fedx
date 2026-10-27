import { z } from "zod";

export const preferenceSchemas = {
  intake: z.object({
    inboundDuplicate: z.enum(["source", "reject"]),
    blankValues: z.enum(["legacy", "preserve"]),
    excelDuplicate: z.enum(["reject", "skip"]),
    bizflyDuplicate: z.enum(["legacy", "skip", "reject"]),
  }).strict(),
  assignment: z.object({ enabled: z.boolean(), preserveAssigned: z.literal(true), sources: z.array(z.enum(["manual", "import", "public_form", "api", "webhook"])).max(5).default(["manual", "import", "public_form", "api", "webhook"]) }).strict(),
  notifications: z.object({ assignment: z.boolean(), reminderDue: z.boolean(), reminderOverdue: z.boolean() }).strict(),
  reminders: z.object({ overdueHours: z.number().int().min(1).max(720), warnOverlap: z.boolean() }).strict(),
  sla: z.object({ enabled: z.boolean(), firstContactMinutes: z.number().int().min(5).max(43200) }).strict(),
  exports: z.object({ format: z.enum(["xlsx", "csv"]), columns: z.array(z.enum(["leadCode", "fullName", "phone", "email", "createdAt"])).min(1).max(5).refine(v => new Set(v).size === v.length, "Các cột không được lặp lại.") }).strict(),
} as const;

export type PreferenceSection = keyof typeof preferenceSchemas;
export type SystemPreferences = { [K in PreferenceSection]: z.infer<(typeof preferenceSchemas)[K]> };
export const preferenceSections = Object.keys(preferenceSchemas) as PreferenceSection[];

// These are compatibility defaults. Loading the page never writes or resets them.
export const defaultSystemPreferences: SystemPreferences = {
  intake: { inboundDuplicate: "source", blankValues: "legacy", excelDuplicate: "reject", bizflyDuplicate: "legacy" },
  assignment: { enabled: true, preserveAssigned: true, sources: ["manual", "import", "public_form", "api", "webhook"] },
  notifications: { assignment: true, reminderDue: true, reminderOverdue: true },
  reminders: { overdueHours: 24, warnOverlap: true },
  sla: { enabled: false, firstContactMinutes: 30 },
  exports: { format: "xlsx", columns: ["leadCode", "fullName", "createdAt"] },
};

export const recommendedSystemPreferences: SystemPreferences = {
  ...defaultSystemPreferences,
  intake: { inboundDuplicate: "source", blankValues: "preserve", excelDuplicate: "reject", bizflyDuplicate: "legacy" },
};

export type PreferenceSnapshot = {
  section: PreferenceSection;
  value: SystemPreferences[PreferenceSection];
  revision: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function preferenceKey(programId: string, section: PreferenceSection) {
  return `crm.preferences.${programId}.${section}`;
}

export function readPreference<K extends PreferenceSection>(section: K, raw: string | null | undefined): SystemPreferences[K] {
  try {
    const document = raw ? JSON.parse(raw) : null;
    const parsed = preferenceSchemas[section].safeParse(document?.value);
    if (parsed.success) return parsed.data as SystemPreferences[K];
  } catch { /* Legacy/malformed values are never overwritten on read. */ }
  return structuredClone(defaultSystemPreferences[section]);
}

export function isTechnicalSetting(key: string, type?: string | null) {
  return type === "secret" || key.startsWith("migration.") || key.startsWith("crm.preferences.");
}

export function isStructuredSetting(key: string) {
  return key === "admission_status_flow" || ["form_field_requirements.", "lead_transition_notes.", "crm.preferences."].some(prefix => key.startsWith(prefix));
}

/** Used by both simulation and inbound writes; identity fields cannot be erased. */
export function selectInboundFields<T extends string>(fields: Iterable<T>, input: Partial<Record<T, unknown>>, preserveBlanks: boolean) {
  return new Set([...fields].filter(key => !preserveBlanks || (input[key] !== undefined && input[key] !== null && (typeof input[key] !== "string" || (input[key] as string).trim() !== ""))));
}

export function simulatePreferences(preferences: SystemPreferences, source: "excel" | "bizfly" | "inbound", duplicate: boolean) {
  const policy = source === "excel" ? preferences.intake.excelDuplicate : source === "bizfly" ? preferences.intake.bizflyDuplicate : preferences.intake.inboundDuplicate;
  const action = !duplicate ? "Tạo lead mới" : policy === "reject" ? "Từ chối dòng trùng" : policy === "skip" ? "Bỏ qua dòng trùng" : source === "bizfly" ? "Cập nhật theo quy tắc nhập Bizfly hiện có" : "Áp dụng chính sách của form hoặc tích hợp";
  const assignment = source === "bizfly" ? "Nhập lịch sử Bizfly giữ nhân viên trong file; không chạy phân công tự động"
    : !preferences.assignment.enabled || (source === "excel" && !preferences.assignment.sources.includes("import")) ? "Tạm dừng các node tự phân công cho nguồn này"
    : "Áp dụng rule phân công cho các nguồn đã tích chọn; giữ người phụ trách đã có";
  return { action, assignment, blankValues: source !== "inbound" ? "Áp dụng quy tắc của loại file nhập" : preferences.intake.blankValues === "preserve" ? "Giữ dữ liệu hiện có khi đầu vào rỗng" : "Giữ hành vi cập nhật hiện tại của nguồn" };
}
