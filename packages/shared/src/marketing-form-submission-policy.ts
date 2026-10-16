export type MarketingFormSubmissionMode = "survey_only" | "create_lead" | "upsert_lead";
export const marketingFormUpdateFields = ["email", "major_id", "gender", "date_of_birth", "note"] as const;
export type MarketingFormUpdateField = typeof marketingFormUpdateFields[number];
export type MarketingFormSubmissionPolicy = {
  version: 1;
  submissionMode: MarketingFormSubmissionMode;
  updatePolicy: "fill_empty" | "overwrite_selected";
  overwriteFields: MarketingFormUpdateField[];
};

/** Creation-only defaults. Never apply this to reads, updates or copies. */
export function newMarketingFormSubmissionSettings(formType: string, settings: Record<string, unknown> = {}): Record<string, unknown> {
  if (settings.submissionMode !== undefined || !["survey", "lead_form"].includes(formType)) return { ...settings };
  return { ...settings, submissionMode: formType === "survey" ? "survey_only" : "create_lead", submissionPolicyVersion: 1, updatePolicy: "fill_empty", overwriteFields: [] };
}

/** Absent mode is legacy, not an implicit migration of a live form. */
export function readMarketingFormSubmissionPolicy(settings: unknown): MarketingFormSubmissionPolicy | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const value = settings as Record<string, unknown>;
  if (value.submissionMode === undefined || value.submissionMode === "legacy") return null;
  if (!["survey_only", "create_lead", "upsert_lead"].includes(String(value.submissionMode))) throw new Error("Chế độ xử lý phản hồi không hợp lệ.");
  if (value.submissionPolicyVersion !== 1) throw new Error("Phiên bản chính sách phản hồi không hợp lệ.");
  const updatePolicy = value.updatePolicy ?? "fill_empty";
  if (!["fill_empty", "overwrite_selected"].includes(String(updatePolicy))) throw new Error("Chính sách cập nhật không hợp lệ.");
  const fields = value.overwriteFields ?? [];
  if (!Array.isArray(fields) || fields.some((field) => !marketingFormUpdateFields.includes(field))) throw new Error("Trường ghi đè không được phép.");
  return { version: 1, submissionMode: value.submissionMode as MarketingFormSubmissionMode, updatePolicy: updatePolicy as MarketingFormSubmissionPolicy["updatePolicy"], overwriteFields: [...new Set(fields)] };
}

export function marketingFormPublicationType(formType: string, settings: unknown) {
  const policy = readMarketingFormSubmissionPolicy(settings);
  return policy ? policy.submissionMode === "survey_only" ? "survey" : "lead_form" : formType;
}
