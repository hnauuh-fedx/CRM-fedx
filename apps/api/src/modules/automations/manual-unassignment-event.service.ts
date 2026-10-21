import { randomUUID } from "node:crypto";
import { z } from "zod";

import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AutomationContext } from "./automation-execution.types";

const jobType = "manual_lead_unassignment";
const payloadSchema = z.object({
  source: z.literal("manual"),
  leadId: z.uuid(),
  actorId: z.uuid(),
  institutionProgramId: z.uuid().nullable(),
}).strict();
type EventPayload = z.infer<typeof payloadSchema>;
type Trigger = (
  triggerType: string,
  context: Omit<AutomationContext, "ruleId">,
  options: { eventId: string; retryFailedExecutions: boolean },
) => Promise<{ matched: number; started: number; failed: number; unavailable: boolean }>;

// Called only by the server-side manual unassignment mutation, in its transaction.
export async function createManualUnassignmentEvent(tx: Prisma.TransactionClient, payload: Omit<EventPayload, "source">) {
  const id = randomUUID();
  await tx.automation_jobs.create({ data: {
    id, type: jobType, status: "pending", run_at: new Date(),
    payload: { ...payload, source: "manual" },
  } });
  await tx.leads.update({ where: { id: payload.leadId }, data: { manual_unassignment_event_id: id } });
  return id;
}

export async function dispatchManualUnassignmentEvent(eventId: string, trigger?: Trigger) {
  const now = new Date();
  const claimed = await prisma.automation_jobs.updateMany({
    where: { id: eventId, type: jobType, OR: [
      { status: { in: ["pending", "failed"] }, run_at: { lte: now } },
      { status: "processing", updated_at: { lt: new Date(now.getTime() - 300_000) } },
    ] },
    data: { status: "processing", updated_at: now, error_message: null },
  });
  if (!claimed.count) return { ok: true, claimed: false };
  const job = await prisma.automation_jobs.findUniqueOrThrow({ where: { id: eventId }, select: { payload: true } });
  const parsed = payloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    await failEvent(eventId, "Sự kiện bỏ Sale thủ công không hợp lệ.", false);
    return { ok: false, claimed: true };
  }
  try {
    const payload = parsed.data;
    const lead = await prisma.leads.findFirst({
      where: { id: payload.leadId, deleted_at: null, assigned_to: null, manual_unassignment_event_id: eventId,
        institution_program_id: payload.institutionProgramId },
      select: { id: true },
    });
    if (lead) {
      const run = trigger ?? (await import("./automation-engine.service.js")).triggerAutomation;
      const result = await run("lead_unassigned", {
        leadId: payload.leadId, actorId: payload.actorId,
        institutionProgramId: payload.institutionProgramId ?? undefined,
        manualUnassignmentEventId: eventId,
      }, { eventId, retryFailedExecutions: true });
      if (result.unavailable || result.failed || result.started !== result.matched) {
        throw new Error("Hàng đợi chưa tiếp nhận hết sự kiện bỏ Sale thủ công.");
      }
    }
    await prisma.automation_jobs.update({ where: { id: eventId }, data: {
      status: "completed", completed_at: new Date(), updated_at: new Date(), error_message: null,
    } });
    return { ok: true, claimed: true };
  } catch (error) {
    await failEvent(eventId, error instanceof Error ? error.message : String(error), true);
    return { ok: false, claimed: true };
  }
}

export async function recoverManualUnassignmentEvents(limit = 100, trigger?: Trigger, eventIds?: string[]) {
  const now = new Date();
  const jobs = await prisma.automation_jobs.findMany({
    where: { type: jobType, ...(eventIds ? { id: { in: eventIds } } : {}), OR: [
      { status: { in: ["pending", "failed"] }, run_at: { lte: now } },
      { status: "processing", updated_at: { lt: new Date(now.getTime() - 300_000) } },
    ] },
    select: { id: true }, orderBy: [{ run_at: "asc" }, { id: "asc" }], take: Math.min(Math.max(limit, 1), 500),
  });
  let completed = 0;
  for (const job of jobs) {
    const result = await dispatchManualUnassignmentEvent(job.id, trigger);
    if (result.ok && result.claimed) completed++;
  }
  return { scanned: jobs.length, completed };
}

async function failEvent(id: string, message: string, retryable: boolean) {
  await prisma.automation_jobs.update({ where: { id }, data: {
    status: "failed", error_message: message.slice(0, 1000), updated_at: new Date(),
    run_at: retryable ? new Date(Date.now() + 60_000) : null,
  } });
}
