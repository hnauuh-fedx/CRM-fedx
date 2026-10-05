import { UnrecoverableError } from "bullmq";

import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getLeadScopeWhere } from "../leads/lead-list.service";
import { getAutomationTemplateReferences, getAutomationLeadData, renderAutomationTemplate } from "./automation-data-field.service";
import { claimAutomationDelivery, classifyAutomationDeliveryHttpStatus } from "./automation-delivery-state.service";
import { getSuppressionReason, hashDestination, maskDestination, normalizeDestination, type AutomationMessageChannel, type AutomationConsentStatus } from "./automation-channel-policy";

type SendAutomationMessageInput = {
  actor: AuthUser;
  leadId: string;
  institutionProgramId?: string;
  nodeExecutionId: string;
  channel: AutomationMessageChannel;
  subject?: string;
  content: string;
  consentPolicy: "require_consent" | "allow_unknown";
};

const providerConfig = {
  email: () => ({ url: env.AUTOMATION_EMAIL_PROVIDER_URL, token: env.AUTOMATION_EMAIL_PROVIDER_TOKEN }),
  sms: () => ({ url: env.AUTOMATION_SMS_PROVIDER_URL, token: env.AUTOMATION_SMS_PROVIDER_TOKEN }),
  zns: () => ({ url: env.AUTOMATION_ZNS_PROVIDER_URL, token: env.AUTOMATION_ZNS_PROVIDER_TOKEN }),
} satisfies Record<AutomationMessageChannel, () => { url?: string; token?: string }>;

export async function sendAutomationMessage(input: SendAutomationMessageInput) {
  if (!input.actor.permissions.includes("lead.sensitive.view")) {
    throw new UnrecoverableError("Tài khoản kích hoạt không có quyền dùng thông tin liên hệ nhạy cảm.");
  }
  const lead = await prisma.leads.findFirst({
    where: {
      id: input.leadId,
      deleted_at: null,
      ...getLeadScopeWhere(input.actor, input.institutionProgramId),
      ...(input.institutionProgramId ? { institution_program_id: input.institutionProgramId } : {}),
    },
    select: { email: true, phone: true, institution_program_id: true },
  });
  if (!lead) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const destination = input.channel === "email" ? lead.email : lead.phone;
  if (!destination) throw new UnrecoverableError(`Lead chưa có ${input.channel === "email" ? "email" : "số điện thoại"}.`);

  const normalizedDestination = normalizeDestination(input.channel, destination);
  const destinationHash = hashDestination(input.channel, normalizedDestination);
  const [preference, suppression] = await Promise.all([
    prisma.automation_contact_preferences.findUnique({
      where: { lead_id_channel: { lead_id: input.leadId, channel: input.channel } },
      select: { status: true },
    }),
    prisma.automation_suppressions.findFirst({
      where: {
        channel: input.channel,
        destination_hash: destinationHash,
        is_active: true,
        OR: [{ institution_program_id: null }, { institution_program_id: lead.institution_program_id }],
      },
      select: { id: true },
    }),
  ]);
  const suppressionReason = getSuppressionReason({
    consentStatus: (preference?.status ?? "unknown") as AutomationConsentStatus,
    consentPolicy: input.consentPolicy,
    isSuppressed: Boolean(suppression),
  });
  const delivery = await prisma.automation_message_deliveries.upsert({
    where: { node_execution_id: input.nodeExecutionId },
    create: {
      node_execution_id: input.nodeExecutionId,
      channel: input.channel,
      destination_hash: destinationHash,
      destination_masked: maskDestination(input.channel, normalizedDestination),
      status: suppressionReason ? "suppressed" : "pending",
      error_code: suppressionReason,
    },
    update: {},
  });
  if (delivery.status === "sent" || delivery.status === "suppressed") return { status: delivery.status };
  if (suppressionReason) {
    await prisma.automation_message_deliveries.update({
      where: { id: delivery.id },
      data: { status: "suppressed", error_code: suppressionReason, error_message: null, updated_at: new Date() },
    });
    return { status: "suppressed" as const };
  }

  const config = providerConfig[input.channel]();
  if (!config.url || !config.token) throw new UnrecoverableError(`Provider ${input.channel.toUpperCase()} chưa được cấu hình.`);
  const references = getAutomationTemplateReferences(input.subject ?? "", input.content);
  const values = references.length
    ? await getAutomationLeadData(input.actor, input.leadId, input.institutionProgramId, references)
    : new Map<string, unknown>();
  if (!values) throw new UnrecoverableError("Không thể đọc dữ liệu Lead để dựng nội dung gửi.");
  const body = JSON.stringify({
    to: normalizedDestination,
    subject: input.subject ? renderAutomationTemplate(input.subject, values) : undefined,
    content: renderAutomationTemplate(input.content, values),
  });
  if (Buffer.byteLength(body, "utf8") > 64 * 1024) throw new UnrecoverableError("Nội dung gửi vượt quá giới hạn 64 KB.");

  const claim = await claimAutomationDelivery(delivery.id);
  if (!claim.claimed) {
    if (claim.status === "sent" || claim.status === "suppressed") return { status: claim.status };
    throw new Error("Lượt gửi đang được worker khác xử lý.");
  }
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}`, "idempotency-key": delivery.id },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    await recordTransientFailure(delivery.id, claim.attemptCount, "network_error", toErrorMessage(error));
    throw error;
  }
  const classification = classifyAutomationDeliveryHttpStatus(response.status);
  if (classification !== "success") {
    const message = `Provider ${input.channel.toUpperCase()} trả về HTTP ${response.status}.`;
    await recordTransientFailure(delivery.id, claim.attemptCount, `http_${response.status}`, message);
    if (classification === "unrecoverable") throw new UnrecoverableError(message);
    throw new Error(message);
  }
  const providerDeliveryId = response.headers.get("x-delivery-id")?.slice(0, 255) ?? null;
  await prisma.automation_message_deliveries.updateMany({
    where: { id: delivery.id, status: "sending", attempt_count: claim.attemptCount },
    data: { status: "sent", provider_delivery_id: providerDeliveryId, sent_at: new Date(), updated_at: new Date(), error_code: null, error_message: null },
  });
  return { status: "sent" as const };
}

async function recordTransientFailure(id: string, attemptCount: number, code: string, message: string) {
  await prisma.automation_message_deliveries.updateMany({
    where: { id, status: "sending", attempt_count: attemptCount },
    data: { status: "failed", error_code: code, error_message: message.slice(0, 1000), updated_at: new Date() },
  });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function setAutomationContactPreference(user: AuthUser, input: {
  leadId: string;
  channel: AutomationMessageChannel;
  status: AutomationConsentStatus;
  source?: string;
}) {
  const lead = await prisma.leads.findFirst({
    where: { id: input.leadId, deleted_at: null, ...getLeadScopeWhere(user) },
    select: { id: true },
  });
  if (!lead) return null;
  const preference = await prisma.$transaction(async (tx) => {
    const saved = await tx.automation_contact_preferences.upsert({
      where: { lead_id_channel: { lead_id: input.leadId, channel: input.channel } },
      create: { lead_id: input.leadId, channel: input.channel, status: input.status, source: input.source, updated_by: user.id },
      update: { status: input.status, source: input.source, updated_by: user.id, updated_at: new Date() },
      select: { id: true, lead_id: true, channel: true, status: true, source: true, updated_at: true },
    });
    await tx.audit_logs.create({
      data: { user_id: user.id, entity_type: "lead", entity_id: input.leadId, action: "automation_contact_preference_updated", new_data: { channel: input.channel, status: input.status, source: input.source } },
    });
    return saved;
  });
  return preference;
}

export async function suppressAutomationDestination(user: AuthUser, input: {
  channel: AutomationMessageChannel;
  destination: string;
  reason?: string;
  institutionProgramId?: string;
}) {
  if (input.institutionProgramId && user.accessScope !== "ALL" && !user.institutionProgramIds.includes(input.institutionProgramId)) return null;
  if (!input.institutionProgramId && !(user.accessScope === "ALL" && user.permissions.includes("automation.manage_global"))) return null;
  const destinationHash = hashDestination(input.channel, input.destination);
  const suppression = await prisma.$transaction(async (tx) => {
    const saved = await tx.automation_suppressions.create({
      data: {
        institution_program_id: input.institutionProgramId,
        channel: input.channel,
        destination_hash: destinationHash,
        reason: input.reason,
        created_by: user.id,
      },
      select: { id: true, institution_program_id: true, channel: true, reason: true, is_active: true, created_at: true },
    });
    await tx.audit_logs.create({
      data: { user_id: user.id, entity_type: "automation_suppression", entity_id: saved.id, action: "created", new_data: { channel: input.channel, institutionProgramId: input.institutionProgramId, reason: input.reason } },
    });
    return saved;
  });
  return { ...suppression, destinationMasked: maskDestination(input.channel, input.destination) };
}
