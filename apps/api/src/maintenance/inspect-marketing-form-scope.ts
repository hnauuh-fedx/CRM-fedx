import { prisma } from "../database/prisma";
import { z } from "zod";
import { inspectMarketingFormScope } from "./marketing-form-scope-inspection";

// Read-only, valid both before and after the expand migration. No customer PII.
async function inspect() {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^(--after=|--limit=|--fail-on-unresolved$)/.test(arg))) throw new Error("Chỉ hỗ trợ --after=<UUID>, --limit=1..100 và --fail-on-unresolved.");
  const afterId = z.uuid().optional().parse(args.find(arg => arg.startsWith("--after="))?.slice(8));
  const limit = z.coerce.number().int().min(1).max(100).parse(args.find(arg => arg.startsWith("--limit="))?.slice(8) ?? 100);
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const programColumns = await tx.$queryRaw<Array<{ is_nullable: string }>>`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_forms' AND column_name = 'institution_program_id'`;
    const scope = await inspectMarketingFormScope(tx, { afterId, limit });
    const submissionColumns = await tx.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketing_form_submissions' ORDER BY ordinal_position`;
    const mappings = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM marketing_form_fields
      WHERE lead_field IS NOT NULL AND crm_mapping_field IS NOT NULL AND lead_field <> crm_mapping_field
    `;
    const options = await tx.$queryRaw<Array<{ option_type: string; count: bigint }>>`
      SELECT jsonb_typeof(option.value) AS option_type, COUNT(*) AS count
      FROM marketing_form_fields field
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(field.options) = 'array' THEN field.options ELSE '[]'::jsonb END) AS option(value)
      GROUP BY jsonb_typeof(option.value) ORDER BY option_type
    `;
    const modes = await tx.$queryRaw<Array<{ form_type: string | null; submission_mode: string | null; policy_version: string | null; duplicate_action: string | null; count: bigint }>>`
      SELECT form_type, duplicate_settings->>'submissionMode' AS submission_mode,
        duplicate_settings->>'submissionPolicyVersion' AS policy_version,
        duplicate_settings->>'action' AS duplicate_action, COUNT(*) AS count
      FROM marketing_forms GROUP BY form_type, duplicate_settings->>'submissionMode', duplicate_settings->>'submissionPolicyVersion', duplicate_settings->>'action'
      ORDER BY form_type, submission_mode, policy_version, duplicate_action
    `;
    return { programColumnPresent: programColumns.length > 0, programColumnNullable: programColumns[0]?.is_nullable === "YES", submissionColumns, ...scope, conflictingMappingFields: mappings[0].count, optionTypes: options, legacyModes: modes };
  }, { isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(report, (_, value) => typeof value === "bigint" ? Number(value) : value, 2));
  if (args.includes("--fail-on-unresolved") && (!report.programColumnPresent || report.counts.missingProgram > 0n || report.counts.campaignMismatch > 0n)) process.exitCode = 2;
}
inspect().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
