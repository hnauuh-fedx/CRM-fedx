import { Prisma } from "../generated/prisma/client";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
export type ScopeInspectionOptions = { afterId?: string; limit?: number; formIds?: string[] };

/** DBA-only read-only diagnostic, not a business API. Never returns answers or public secrets. */
export async function inspectMarketingFormScope(client: Reader, options: ScopeInspectionOptions = {}) {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Giới hạn cần từ 1 đến 100.");
  const scope = options.formIds === undefined ? Prisma.sql`TRUE`
    : options.formIds.length ? Prisma.sql`f.id IN (${Prisma.join(options.formIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.sql`FALSE`;
  // to_jsonb keeps this query usable before the nullable column is introduced.
  // Campaign is only a proposed backfill, never the current source of truth.
  const base = Prisma.sql`
    SELECT f.id, f.status, f.campaign_id,
      to_jsonb(f)->>'institution_program_id' AS direct_program,
      c.institution_program_id::text AS candidate_program
    FROM marketing_forms f LEFT JOIN campaigns c ON c.id = f.campaign_id WHERE ${scope}
  `;
  const [counts] = await client.$queryRaw<Array<{
    total: bigint; assigned: bigint; missingProgram: bigint; backfillable: bigint;
    unresolved: bigint; liveMissingProgram: bigint; campaignMismatch: bigint;
  }>>(Prisma.sql`
    WITH forms AS (${base}) SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE direct_program IS NOT NULL) AS assigned,
      COUNT(*) FILTER (WHERE direct_program IS NULL) AS "missingProgram",
      COUNT(*) FILTER (WHERE direct_program IS NULL AND candidate_program IS NOT NULL) AS backfillable,
      COUNT(*) FILTER (WHERE direct_program IS NULL AND candidate_program IS NULL) AS unresolved,
      COUNT(*) FILTER (WHERE direct_program IS NULL AND status IN ('published', 'active')) AS "liveMissingProgram",
      COUNT(*) FILTER (WHERE direct_program IS NOT NULL AND candidate_program IS NOT NULL AND direct_program <> candidate_program) AS "campaignMismatch"
    FROM forms
  `);
  const review = await client.$queryRaw<Array<{
    id: string; status: string | null; campaignId: string | null;
    directProgramId: string | null; candidateProgramId: string | null; reason: string;
  }>>(Prisma.sql`
    WITH forms AS (${base}) SELECT id, status, campaign_id AS "campaignId",
      direct_program AS "directProgramId", candidate_program AS "candidateProgramId",
      CASE WHEN direct_program IS NOT NULL THEN 'campaign_mismatch'
           WHEN candidate_program IS NOT NULL THEN 'backfill_candidate' ELSE 'manual_review' END AS reason
    FROM forms
    WHERE (direct_program IS NULL OR (candidate_program IS NOT NULL AND direct_program <> candidate_program))
      ${options.afterId ? Prisma.sql`AND id > ${options.afterId}::uuid` : Prisma.empty}
    ORDER BY id LIMIT ${limit + 1}
  `);
  const hasMore = review.length > limit;
  const data = review.slice(0, limit);
  return { counts, review: data, hasMore, nextCursor: hasMore ? data.at(-1)!.id : null };
}
