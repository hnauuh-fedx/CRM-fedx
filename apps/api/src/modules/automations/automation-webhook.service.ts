import { createHmac } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { UnrecoverableError } from "bullmq";

import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getAutomationLeadData, getAutomationTemplateReferences, renderAutomationTemplate } from "./automation-data-field.service";
import { claimAutomationDelivery, classifyAutomationDeliveryHttpStatus } from "./automation-delivery-state.service";
import { hashDestination } from "./automation-channel-policy";
import { decryptAutomationSecret, encryptAutomationSecret } from "./automation-secret-crypto";
import { assertAutomationWebhookPayloadSize, assertAutomationWebhookPublicDns, validateAutomationWebhookTarget } from "./automation-webhook-security";

export async function listAutomationWebhookEndpointOptions(user: AuthUser, institutionProgramId?: string) {
  const programIds = user.accessScope === "ALL" && user.permissions.includes("lead.view_all")
    ? null
    : user.institutionProgramIds;
  if (institutionProgramId && programIds !== null && !programIds.includes(institutionProgramId)) return null;
  const endpoints = await prisma.automation_webhook_endpoints.findMany({
    where: {
      is_active: true,
      ...(institutionProgramId
        ? { OR: [{ institution_program_id: institutionProgramId }, ...(user.permissions.includes("automation.manage_global") ? [{ institution_program_id: null }] : [])] }
        : programIds === null
          ? user.permissions.includes("automation.manage_global") ? {} : { institution_program_id: { not: null } }
          : { institution_program_id: { in: programIds } }),
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 500,
  });
  return endpoints;
}

export async function createAutomationWebhookEndpoint(user: AuthUser, input: {
  name: string;
  url: string;
  secret: string;
  allowedHosts: string[];
  institutionProgramId?: string;
}) {
  if (!canManageEndpointScope(user, input.institutionProgramId)) return null;
  const target = validateAutomationWebhookTarget(input.url, input.allowedHosts);
  if (!target.ok) return { ok: false as const, reason: target.reason };
  try {
    await assertAutomationWebhookPublicDns(target.hostname);
  } catch {
    return { ok: false as const, reason: "unsafe_dns" as const };
  }
  const endpoint = await prisma.automation_webhook_endpoints.create({
    data: {
      name: input.name,
      url: target.url.toString(),
      secret_encrypted: encryptAutomationSecret(input.secret),
      allowed_hosts: input.allowedHosts.map((host) => host.trim().toLowerCase()),
      institution_program_id: input.institutionProgramId,
      created_by: user.id,
    },
    select: { id: true, name: true, url: true, institution_program_id: true, is_active: true },
  });
  await prisma.audit_logs.create({
    data: { user_id: user.id, entity_type: "automation_webhook_endpoint", entity_id: endpoint.id, action: "created", new_data: { name: endpoint.name, url: endpoint.url, institutionProgramId: endpoint.institution_program_id } },
  });
  return { ok: true as const, data: endpoint };
}

export async function callAutomationWebhook(input: {
  actor: AuthUser;
  leadId?: string;
  institutionProgramId?: string;
  nodeExecutionId: string;
  endpointId: string;
  payloadTemplate: string;
}) {
  const endpoint = await prisma.automation_webhook_endpoints.findFirst({
    where: {
      id: input.endpointId,
      is_active: true,
      OR: [
        { institution_program_id: input.institutionProgramId ?? "00000000-0000-4000-8000-000000000000" },
        ...(input.actor.permissions.includes("automation.manage_global") ? [{ institution_program_id: null }] : []),
      ],
    },
  });
  if (!endpoint) throw new UnrecoverableError("Webhook endpoint không tồn tại trong phạm vi của rule.");
  const allowedHosts = Array.isArray(endpoint.allowed_hosts) ? endpoint.allowed_hosts.filter((value): value is string => typeof value === "string") : [];
  const target = validateAutomationWebhookTarget(endpoint.url, allowedHosts);
  if (!target.ok) throw new UnrecoverableError(`Webhook endpoint không an toàn: ${target.reason}.`);
  let dnsTarget: Awaited<ReturnType<typeof assertAutomationWebhookPublicDns>>;
  try {
    dnsTarget = await assertAutomationWebhookPublicDns(target.hostname);
  } catch (error) {
    throw new UnrecoverableError(toErrorMessage(error));
  }
  const references = getAutomationTemplateReferences(input.payloadTemplate);
  const values = input.leadId && references.length
    ? await getAutomationLeadData(input.actor, input.leadId, input.institutionProgramId, references)
    : new Map<string, unknown>();
  if (!values) throw new UnrecoverableError("Lead không tồn tại trong phạm vi của tài khoản kích hoạt.");
  const payload = renderAutomationTemplate(input.payloadTemplate, values);
  try {
    assertAutomationWebhookPayloadSize(payload);
  } catch (error) {
    throw new UnrecoverableError(toErrorMessage(error));
  }
  try {
    JSON.parse(payload);
  } catch {
    throw new UnrecoverableError("Payload webhook sau khi dựng không phải JSON hợp lệ.");
  }
  const delivery = await prisma.automation_message_deliveries.upsert({
    where: { node_execution_id: input.nodeExecutionId },
    create: {
      node_execution_id: input.nodeExecutionId,
      channel: "webhook",
      destination_hash: hashDestination("email", target.url.origin),
      destination_masked: target.hostname,
    },
    update: {},
  });
  if (delivery.status === "sent") return;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let secret: string;
  try {
    secret = decryptAutomationSecret(endpoint.secret_encrypted);
  } catch (error) {
    throw new UnrecoverableError(toErrorMessage(error));
  }
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const claim = await claimAutomationDelivery(delivery.id);
  if (!claim.claimed) {
    if (claim.status === "sent" || claim.status === "suppressed") return;
    throw new Error("Webhook đang được worker khác xử lý.");
  }
  let response: { status: number; deliveryId: string | null };
  try {
    response = await postPinnedWebhook(target.url, dnsTarget, {
      "content-type": "application/json",
      "x-crm-timestamp": timestamp,
      "x-crm-signature": `sha256=${signature}`,
      "idempotency-key": delivery.id,
    }, payload);
  } catch (error) {
    await failDelivery(delivery.id, claim.attemptCount, "network_error", toErrorMessage(error));
    throw error;
  }
  const classification = classifyAutomationDeliveryHttpStatus(response.status);
  if (classification !== "success") {
    const message = `Webhook trả về HTTP ${response.status}.`;
    await failDelivery(delivery.id, claim.attemptCount, `http_${response.status}`, message);
    if (classification === "unrecoverable") throw new UnrecoverableError(message);
    throw new Error(message);
  }
  await prisma.automation_message_deliveries.updateMany({
    where: { id: delivery.id, status: "sending", attempt_count: claim.attemptCount },
    data: { status: "sent", provider_delivery_id: response.deliveryId, sent_at: new Date(), updated_at: new Date(), error_code: null, error_message: null },
  });
}

function canManageEndpointScope(user: AuthUser, institutionProgramId?: string) {
  if (!institutionProgramId) return user.accessScope === "ALL" && user.permissions.includes("automation.manage_global");
  return user.accessScope === "ALL" || user.institutionProgramIds.includes(institutionProgramId);
}

async function failDelivery(id: string, attemptCount: number, code: string, message: string) {
  await prisma.automation_message_deliveries.updateMany({ where: { id, status: "sending", attempt_count: attemptCount }, data: { status: "failed", error_code: code, error_message: message.slice(0, 1000), updated_at: new Date() } });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function postPinnedWebhook(
  url: URL,
  dnsTarget: { address: string; family: number },
  headers: Record<string, string>,
  payload: string,
) {
  return new Promise<{ status: number; deliveryId: string | null }>((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: { ...headers, "content-length": Buffer.byteLength(payload, "utf8") },
      servername: url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, dnsTarget.address, dnsTarget.family),
    }, (response) => {
      response.resume();
      response.once("end", () => resolve({
        status: response.statusCode ?? 500,
        deliveryId: typeof response.headers["x-delivery-id"] === "string" ? response.headers["x-delivery-id"].slice(0, 255) : null,
      }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error("Webhook timeout sau 10 giây.")));
    request.once("error", reject);
    request.end(payload);
  });
}
