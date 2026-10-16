import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";
import { getLeadScopeWhere, leadListPermissions } from "../leads/lead-list.service";
import { getMarketingFormVisibility } from "./marketing-form-scope";

export async function listLeadSurveyHistory(actor: AuthUser, leadId: string, programId: string, page: number, limit: number) {
  const has = (permissions: string[]) => permissions.some((permission) => actor.permissions.includes(permission));
  if (!actor.institutionProgramIds.includes(programId) || !has([...leadListPermissions]) || !has(["campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own"]) || !has(["lead.sensitive.view", "lead.update_all", "lead.update_department", "lead.update_assigned"])) return { ok: false as const };
  const lead = await prisma.leads.findFirst({ where: { id: leadId, deleted_at: null, institution_program_id: programId, AND: [getLeadScopeWhere(actor, programId)] }, select: { id: true } });
  if (!lead) return { ok: false as const };
  const where = { lead_id: leadId, marketing_forms: { is: { AND: getMarketingFormVisibility(actor, programId) } } };
  const [rows, total] = await prisma.$transaction([
    prisma.marketing_form_submissions.findMany({ where, select: { id: true, answers: true, normalized_payload: true, configuration_snapshot: true, created_at: true, source: true, status: true, utm_source: true, utm_medium: true, utm_campaign: true, marketing_forms: { select: { id: true, name: true } } }, orderBy: [{ created_at: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.marketing_form_submissions.count({ where }),
  ]);
  return { ok: true as const, data: { data: rows.map((row) => ({ id: row.id, formId: row.marketing_forms.id, formName: row.marketing_forms.name, answers: row.answers ?? row.normalized_payload, configurationSnapshot: row.configuration_snapshot, source: row.source, status: row.status, utm: { source: row.utm_source, medium: row.utm_medium, campaign: row.utm_campaign }, createdAt: row.created_at?.toISOString() ?? null })), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } } };
}
