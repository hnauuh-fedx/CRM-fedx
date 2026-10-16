import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AutomationContext } from "./automation-execution.types";
import { z } from "zod";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type MarketingFormEventType = "form_submitted" | "survey_completed";

type MarketingFormEventPayload = {
  triggerType: MarketingFormEventType;
  submissionId: string;
  formId: string;
  institutionProgramId: string;
  configurationVersion: string | null;
  leadId: string | null;
  actorId: string | null;
  answers: Record<string, unknown>;
};

const jobType = "marketing_form_event";
const retryDelayMs = 60_000;
const eventPayloadSchema = z.object({
  triggerType: z.enum(["form_submitted", "survey_completed"]),
  submissionId: z.uuid(),
  formId: z.uuid(),
  institutionProgramId: z.uuid(),
  configurationVersion: z.string().max(100).nullable(),
  leadId: z.uuid().nullable(),
  actorId: z.uuid().nullable(),
  answers: z.record(z.string(), z.unknown()),
}).strict();

export async function createMarketingFormAutomationEvent(
  tx: TransactionClient,
  payload: MarketingFormEventPayload,
) {
  const subscribedRule = await tx.automation_rules.findFirst({
    where: {
      is_active: true,
      archived_at: null,
      trigger_type: payload.triggerType,
      OR: [{ institution_program_id: null }, { institution_program_id: payload.institutionProgramId }],
    },
    select: { id: true },
  });
  if (!subscribedRule) return null;

  const saved = await tx.automation_jobs.upsert({
    where: { id: payload.submissionId },
    create: {
      id: payload.submissionId,
      type: jobType,
      status: "pending",
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      run_at: new Date(),
    },
    update: {},
    select: { id: true },
  });
  return saved.id;
}

type TriggerAutomation = (
  triggerType: string,
  context: Omit<AutomationContext, "ruleId">,
  options: { eventId: string; retryFailedExecutions: boolean },
) => Promise<{ matched: number; started: number; failed: number; unavailable: boolean }>;

export async function dispatchMarketingFormAutomationEvent(eventId: string, trigger?: TriggerAutomation) {
  const now = new Date();
  const staleAt = new Date(now.getTime() - 5 * 60_000);
  const claimed = await prisma.automation_jobs.updateMany({
    where: {
      id: eventId,
      type: jobType,
      OR: [
        { status: { in: ["pending", "failed"] }, run_at: { lte: now } },
        { status: "processing", updated_at: { lt: staleAt } },
      ],
    },
    data: { status: "processing", error_message: null, updated_at: now },
  });
  if (claimed.count === 0) return { ok: true as const, claimed: false };

  const job = await prisma.automation_jobs.findUnique({ where: { id: eventId }, select: { payload: true } });
  const payload = parseMarketingFormEvent(job?.payload);
  if (!payload) {
    await failEvent(eventId, "Payload event Form/Survey không hợp lệ.", false);
    return { ok: false as const, reason: "invalid_payload" as const };
  }

  try {
    const run = trigger ?? (await import("./automation-engine.service.js")).triggerAutomation;
    const result = await run(payload.triggerType, {
      actorId: payload.actorId ?? undefined,
      leadId: payload.leadId ?? undefined,
      marketingFormId: payload.formId,
      marketingFormSubmissionId: payload.submissionId,
      institutionProgramId: payload.institutionProgramId,
      payload: {
        eventType: payload.triggerType,
        formId: payload.formId,
        submissionId: payload.submissionId,
        configurationVersion: payload.configurationVersion,
        answers: payload.answers,
      },
    }, { eventId, retryFailedExecutions: true });
    if (result.unavailable || result.failed > 0 || result.started !== result.matched) {
      await failEvent(eventId, "Automation queue chưa xử lý hết event Form/Survey.", true);
      return { ok: false as const, reason: "dispatch_incomplete" as const };
    }
    await prisma.automation_jobs.update({
      where: { id: eventId },
      data: { status: "completed", completed_at: new Date(), error_message: null, updated_at: new Date() },
    });
    return { ok: true as const, claimed: true, matched: result.matched };
  } catch (error) {
    await failEvent(eventId, error instanceof Error ? error.message : String(error), true);
    return { ok: false as const, reason: "dispatch_failed" as const };
  }
}

export async function recoverMarketingFormAutomationEvents(limit = 100, trigger?: TriggerAutomation, eventIds?: string[]) {
  const now = new Date();
  const staleAt = new Date(now.getTime() - 5 * 60_000);
  const jobs = await prisma.automation_jobs.findMany({
    where: {
      type: jobType,
      ...(eventIds ? { id: { in: eventIds } } : {}),
      OR: [
        { status: { in: ["pending", "failed"] }, run_at: { lte: now } },
        { status: "processing", updated_at: { lt: staleAt } },
      ],
    },
    select: { id: true },
    orderBy: [{ run_at: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(limit, 1), 500),
  });
  let completed = 0;
  for (const job of jobs) {
    const result = await dispatchMarketingFormAutomationEvent(job.id, trigger);
    if (result.ok && result.claimed) completed += 1;
  }
  return { scanned: jobs.length, completed };
}

function parseMarketingFormEvent(value: Prisma.JsonValue | null | undefined): MarketingFormEventPayload | null {
  const parsed = eventPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function failEvent(eventId: string, message: string, retryable: boolean) {
  await prisma.automation_jobs.update({
    where: { id: eventId },
    data: {
      status: "failed",
      error_message: message.slice(0, 1000),
      run_at: retryable ? new Date(Date.now() + retryDelayMs) : null,
      updated_at: new Date(),
    },
  });
}
