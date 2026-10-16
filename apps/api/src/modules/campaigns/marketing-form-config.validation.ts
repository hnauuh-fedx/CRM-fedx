import { z } from "zod";
import { validateMarketingFormOther } from "@admission-crm/shared/marketing-form-config";
import { validateMarketingFormLayout } from "@admission-crm/shared/marketing-form-layout";
import { validateMarketingFormVisibility } from "@admission-crm/shared/marketing-form-visibility";
import { validateMarketingFormConfig, validateMarketingFormRatings, validateMarketingFormQuestionDescriptions, normalizeMarketingFormOptions, type MarketingFormConfigField, type MarketingFormConfigIssue } from "@admission-crm/shared/marketing-form-config";
import { prisma } from "../../database/prisma";
import { marketingFormPublicationType, readMarketingFormSubmissionPolicy } from "@admission-crm/shared/marketing-form-submission-policy";

export class MarketingFormConfigError extends Error {
  constructor(public readonly issues: MarketingFormConfigIssue[]) {
    super("Cấu hình biểu mẫu chưa hợp lệ để xuất bản.");
  }
}
export function assertMarketingFormSubmissionPolicy(settings: unknown) {
  try { readMarketingFormSubmissionPolicy(settings); }
  catch (error) { throw new MarketingFormConfigError([{ path: ["duplicateSettings", "submissionMode"], message: error instanceof Error ? error.message : "Chính sách không hợp lệ." }]); }
}
export function assertMarketingFormLayout(settings: unknown, fields: MarketingFormConfigField[]) {
  const issues = [...validateMarketingFormLayout(settings, fields), ...validateMarketingFormVisibility(fields), ...validateMarketingFormQuestionDescriptions(fields), ...validateMarketingFormRatings(fields), ...validateMarketingFormOther(fields)];
  if (issues.length) throw new MarketingFormConfigError(issues);
}
export async function assertPublishableMarketingForm(
  fields: MarketingFormConfigField[], formType: string, programId: string | null | undefined,
  client: Pick<typeof prisma, "majors" | "lead_sources"> = prisma,
  settings?: unknown,
) {
  assertMarketingFormSubmissionPolicy(settings);
  const publicationType = marketingFormPublicationType(formType, settings);
  const issues = [...validateMarketingFormConfig(fields, publicationType), ...validateMarketingFormVisibility(fields, publicationType)];
  if (!programId) issues.push({ path: ["institutionProgramId"], message: "Biểu mẫu chưa có chương trình làm việc." });
  for (const target of ["major_id", "source_id"] as const) {
    const candidates = fields.flatMap((field, index) => field.isActive !== false && (field.crmMappingField ?? field.leadField) === target
      ? [{ field, index, values: [...new Set([...normalizeMarketingFormOptions(field.options).map((option) => option.value), ...(field.defaultValue ? [field.defaultValue] : [])])] }] : []);
    const ids = candidates.flatMap(({ values }) => values.filter((value) => z.uuid().safeParse(value).success));
    const where = { id: { in: ids }, OR: [{ institution_program_id: programId ?? "00000000-0000-0000-0000-000000000000" }, { institution_program_id: null }] };
    const rows = target === "major_id" ? await client.majors.findMany({ where, select: { id: true } }) : await client.lead_sources.findMany({ where, select: { id: true } });
    const validIds = new Set(rows.map((row) => row.id));
    for (const { index, values } of candidates) if (values.some((value) => !validIds.has(value))) issues.push({ path: ["fields", index, "options"], message: "Mapping ngành/nguồn phải dùng mã CRM tồn tại trong chương trình của biểu mẫu; lựa chọn khảo sát hãy chọn Chỉ lưu câu trả lời." });
  }
  if (issues.length) throw new MarketingFormConfigError(issues);
}
