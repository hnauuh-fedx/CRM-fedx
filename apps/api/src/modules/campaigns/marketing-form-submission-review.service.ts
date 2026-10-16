import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere, leadListPermissions } from "../leads/lead-list.service";
import { canUpdateLead } from "../leads/application/lead-authorization";
import { getMarketingFormVisibility } from "./marketing-form-scope";

export function canReviewMarketingFormSubmission(actor: AuthUser, programId: string) {
  return actor.accessScope !== "READ_ONLY" && actor.institutionProgramIds.includes(programId)
    && ["marketing_form.manage", "marketing_form.update_own"].some((key) => actor.permissions.includes(key))
    && leadListPermissions.some((key) => actor.permissions.includes(key)) && canUpdateLead(actor);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function candidateWhere(actor: AuthUser, programId: string, payload: unknown): Prisma.leadsWhereInput {
  const normalized = record(payload);
  const phone = typeof normalized.phone === "string" ? normalized.phone : "";
  const email = typeof normalized.email === "string" ? normalized.email : "";
  const updatePermissions = actor.permissions.flatMap((key) => key === "lead.update_all" ? ["lead.view_all"] : key === "lead.update_department" ? ["lead.view_department"] : key === "lead.update_assigned" ? ["lead.view_assigned"] : []);
  return { institution_program_id: programId, deleted_at: null, AND: [
    getLeadScopeWhere(actor, programId),
    getLeadScopeWhere({ ...actor, permissions: updatePermissions }, programId),
    { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []), { id: "00000000-0000-4000-8000-000000000000" }] },
  ] };
}
const selectSubmission = { id: true, marketing_form_id: true, normalized_payload: true, status: true, lead_id: true } as const;
function submissionWhere(actor: AuthUser, programId: string, formId: string, submissionId: string): Prisma.marketing_form_submissionsWhereInput {
  return { id: submissionId, marketing_form_id: formId, marketing_forms: { is: { AND: getMarketingFormVisibility(actor, programId) } } };
}
export async function listMarketingFormReviewCandidates(actor: AuthUser, programId: string, formId: string, submissionId: string, page: number, limit: number, search?: string) {
  if (!canReviewMarketingFormSubmission(actor, programId)) return { ok: false as const, reason: "permission_denied" as const };
  const submission = await prisma.marketing_form_submissions.findFirst({ where: submissionWhere(actor, programId, formId, submissionId), select: selectSubmission });
  if (!submission) return { ok: false as const, reason: "not_found" as const };
  if (submission.status !== "needs_review") return { ok: false as const, reason: "already_resolved" as const };
  const where: Prisma.leadsWhereInput = { AND: [candidateWhere(actor, programId, submission.normalized_payload), ...(search ? [{ OR: [{ full_name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search } }] }] : [])] };
  const [rows, total] = await prisma.$transaction([
    prisma.leads.findMany({ where, select: { id: true, lead_code: true, full_name: true, phone: true }, orderBy: [{ full_name: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.leads.count({ where }),
  ]);
  return { ok: true as const, data: { data: rows.map((row) => ({ id: row.id, leadCode: row.lead_code, fullName: row.full_name, phone: row.phone })), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } } };
}
export type MarketingFormReviewDecision = { action: "link"; leadId: string; reason: string } | { action: "ignore"; reason: string };
export async function resolveMarketingFormSubmission(actor: AuthUser, programId: string, formId: string, submissionId: string, decision: MarketingFormReviewDecision, ipAddress?: string) {
  if (!canReviewMarketingFormSubmission(actor, programId)) return { ok: false as const, reason: "permission_denied" as const };
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`marketing-form:${formId}`}))::text`;
    await tx.$queryRaw`SELECT id FROM marketing_form_submissions WHERE id = ${submissionId}::uuid FOR UPDATE`;
    const submission = await tx.marketing_form_submissions.findFirst({ where: submissionWhere(actor, programId, formId, submissionId), select: selectSubmission });
    if (!submission) return { ok: false as const, reason: "not_found" as const };
    const status = decision.action === "link" ? "linked" : "ignored";
    const leadId = decision.action === "link" ? decision.leadId : null;
    if (leadId) {
      await tx.$queryRaw`SELECT id FROM leads WHERE id = ${leadId}::uuid FOR UPDATE`;
      const lead = await tx.leads.findFirst({ where: { id: leadId, AND: [candidateWhere(actor, programId, submission.normalized_payload)] }, select: { id: true } });
      if (!lead) return { ok: false as const, reason: "lead_not_available" as const };
    }
    if (submission.status !== "needs_review") {
      if (submission.status === status && submission.lead_id === leadId) return { ok: true as const, data: { id: submission.id, status, replayed: true } };
      return { ok: false as const, reason: "already_resolved" as const };
    }
    await tx.marketing_form_submissions.update({ where: { id: submission.id }, data: { status, lead_id: leadId, error_message: null } });
    const metadata = { marketingFormId: formId, submissionId, action: decision.action, reason: decision.reason.trim() };
    if (leadId) await tx.lead_activities.create({ data: { lead_id: leadId, user_id: actor.id, type: "marketing_form_reviewed", content: "Liên kết phản hồi khảo sát sau khi xử lý trùng.", metadata } });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "marketing_form_submission", entity_id: submissionId, action: "resolve_duplicate", ip_address: ipAddress, old_data: { status: submission.status, leadId: submission.lead_id }, new_data: { ...metadata, status, leadId } } });
    return { ok: true as const, data: { id: submission.id, status, replayed: false } };
  });
}
