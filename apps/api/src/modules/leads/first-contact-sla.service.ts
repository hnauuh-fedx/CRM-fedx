import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { getPreference } from "../system/system-preferences.service";
import { getAuthUser } from "../auth/auth.service";
import { getLeadScopeWhere } from "./lead-list.service";
import { isFailedLeadStatus } from "./domain/lead-lifecycle-status";

const jobType = "sla_first_contact";
const payloadSchema = z.object({ leadId: z.uuid(), assignmentId: z.uuid(), programId: z.uuid(), assigneeId: z.uuid(), assignedAt: z.iso.datetime() });

export async function scheduleFirstContactSla(tx: Prisma.TransactionClient, leadId: string) {
  const lead = await tx.leads.findUnique({ where: { id: leadId }, select: { institution_program_id: true, assigned_to: true } });
  if (!lead?.institution_program_id || !lead.assigned_to) return;
  const config = await getPreference(lead.institution_program_id, "sla", tx);
  if (!config.enabled) return;
  const assignment = await tx.lead_assignments.findFirst({ where: { lead_id: leadId, assigned_to: lead.assigned_to, is_main_owner: true }, orderBy: [{ assigned_at: "desc" }, { id: "desc" }], select: { id: true, assigned_at: true } });
  if (!assignment?.assigned_at) return;
  const hex = createHash("sha256").update(`${jobType}:${assignment.id}`).digest("hex").slice(0, 32);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  await tx.automation_jobs.upsert({ where: { id }, update: {}, create: {
    id, type: jobType, run_at: new Date(assignment.assigned_at.getTime() + config.firstContactMinutes * 60_000),
    payload: { leadId, assignmentId: assignment.id, programId: lead.institution_program_id, assigneeId: lead.assigned_to, assignedAt: assignment.assigned_at.toISOString() },
  } });
}

export async function processFirstContactSla(now = new Date()) {
  const jobs = await prisma.automation_jobs.findMany({ where: { type: jobType, status: "pending", run_at: { lte: now } }, orderBy: [{ run_at: "asc" }, { id: "asc" }], take: 100 });
  for (const job of jobs) {
    const parsed = payloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      await prisma.automation_jobs.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "failed", error_message: "Dữ liệu tác vụ nhắc liên hệ không hợp lệ.", completed_at: now } });
      continue;
    }
    const payload = parsed.data;
    const config = await getPreference(payload.programId, "sla");
    const user = await getAuthUser(payload.assigneeId, payload.programId);
    await prisma.$transaction(async tx => {
      const leadLock = `lead-assignment:${payload.leadId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${leadLock})) IS NULL AS locked`;
      const claimed = await tx.automation_jobs.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "completed", completed_at: now } });
      if (!claimed.count || !config.enabled || !user || !user.institutionProgramIds.includes(payload.programId)) return;
      const lead = await tx.leads.findFirst({ where: { id: payload.leadId, deleted_at: null, ...getLeadScopeWhere(user, payload.programId), institution_program_id: payload.programId, assigned_to: payload.assigneeId }, select: { id: true, full_name: true, status: true } });
      if (!lead || isFailedLeadStatus(lead.status)) return;
      const current = await tx.lead_assignments.findFirst({ where: { lead_id: lead.id, is_main_owner: true }, orderBy: [{ assigned_at: "desc" }, { id: "desc" }], select: { id: true } });
      if (current?.id !== payload.assignmentId) return;
      const contact = await tx.lead_activities.findFirst({ where: { lead_id: lead.id, created_at: { gte: new Date(payload.assignedAt) }, OR: [{ metadata: { path: ["origin"], equals: "manual" } }, { type: { in: ["call", "meeting", "consultation"] } }] }, select: { id: true } });
      if (contact) return;
      await tx.notifications.create({ data: { user_id: user.id, lead_id: lead.id, type: "sla_violation", title: "Lead quá hạn liên hệ lần đầu", content: `Lead ${lead.full_name} chưa có hoạt động liên hệ được ghi nhận sau khi phân công.` } });
      await tx.lead_activities.create({ data: { lead_id: lead.id, type: "sla_violation", content: "Quá thời hạn liên hệ lần đầu sau khi phân công." } });
      await tx.audit_logs.create({ data: { entity_type: "lead", entity_id: lead.id, action: "sla_violation", new_data: { jobId: job.id, assignmentId: payload.assignmentId } } });
    });
  }
}
