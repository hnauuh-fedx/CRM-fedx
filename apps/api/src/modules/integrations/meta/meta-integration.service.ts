import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client";

import { env, gptApiKey } from "../../../config/env";
import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import {
  extractLeadInformation,
  extractVietnamPhoneFromText,
  mayContainLeadInformation,
  normalizeVietnamPhone,
  resolveInboundLeadName,
  usedProfileNameFallback,
} from "../shared/lead-extraction.service";
import {
  buildMetaAuthorizationUrl,
  exchangeMetaAuthorizationCode,
  getManagedMetaPages,
  getMetaPageInfo,
  getMetaUserProfile,
  subscribeMetaPage,
  unsubscribeMetaPage,
} from "./meta-api.service";
import { decryptMetaSecret, encryptMetaSecret } from "./meta-crypto";
import type { MetaMessagingEvent } from "./meta-webhook.service";

const oauthSessionLifetimeMs = 15 * 60 * 1000;
const leadExtractionContextWindowMs = 15 * 60 * 1000;
const userProfileCacheMs = 7 * 24 * 60 * 60 * 1000;

type MetaConnectionInput = { institutionProgramId: string; leadSourceId: string };

function stateHash(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function connectionScope(user: AuthUser) {
  if (user.accessScope === "ALL" || user.permissions.includes("system.manage")) return {};
  if (user.institutionProgramIds.length > 0) {
    return { OR: [{ institution_program_id: { in: user.institutionProgramIds } }, { created_by: user.id }] };
  }
  return { created_by: user.id };
}

async function validateConnectionScope(user: AuthUser, input: MetaConnectionInput) {
  const [source, program] = await Promise.all([
    prisma.lead_sources.findUnique({ where: { id: input.leadSourceId }, select: { id: true, institution_program_id: true } }),
    prisma.institution_programs.findFirst({ where: { id: input.institutionProgramId, status: "active" }, select: { id: true } }),
  ]);
  if (!source) throw new Error("Nguồn lead đã chọn không tồn tại.");
  if (!program) throw new Error("Chương trình tuyển sinh đã chọn không tồn tại hoặc đã ngừng hoạt động.");
  if (user.accessScope !== "ALL" && !user.permissions.includes("system.manage")
    && !user.institutionProgramIds.includes(input.institutionProgramId)) {
    throw new Error("Bạn không có phạm vi quản lý chương trình tuyển sinh này.");
  }
  if (source.institution_program_id && source.institution_program_id !== input.institutionProgramId) {
    throw new Error("Nguồn lead không thuộc chương trình tuyển sinh đã chọn.");
  }
}

function serializeConnection(connection: {
  id: string; page_id: string; page_name: string | null; status: string;
  webhook_subscribed_at: Date | null; last_checked_at: Date | null; last_error: string | null;
  institution_program_id: string; lead_source_id: string; created_at: Date; updated_at: Date;
}) {
  return {
    id: connection.id,
    pageId: connection.page_id,
    pageName: connection.page_name,
    status: connection.status,
    webhookSubscribedAt: connection.webhook_subscribed_at?.toISOString() ?? null,
    lastCheckedAt: connection.last_checked_at?.toISOString() ?? null,
    lastError: connection.last_error,
    institutionProgramId: connection.institution_program_id,
    leadSourceId: connection.lead_source_id,
    createdAt: connection.created_at.toISOString(),
    updatedAt: connection.updated_at.toISOString(),
  };
}

export async function getMetaConnectionOptions(user: AuthUser) {
  const programWhere = user.accessScope === "ALL" || user.permissions.includes("system.manage")
    ? { status: "active" }
    : { status: "active", id: { in: user.institutionProgramIds } };
  const [leadSources, programs] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: user.institutionProgramIds.length > 0 && user.accessScope !== "ALL"
        ? { OR: [{ institution_program_id: null }, { institution_program_id: { in: user.institutionProgramIds } }] }
        : {},
      select: { id: true, name: true, type: true, institution_program_id: true },
      orderBy: { name: "asc" }, take: 500,
    }),
    prisma.institution_programs.findMany({
      where: programWhere,
      select: { id: true, name: true, institution_name: true },
      orderBy: { name: "asc" }, take: 500,
    }),
  ]);
  return {
    leadSources: leadSources.map((source) => ({ id: source.id, name: source.name, type: source.type, institutionProgramId: source.institution_program_id })),
    institutionPrograms: programs.map((program) => ({ id: program.id, name: program.name, institutionName: program.institution_name })),
  };
}

export async function listMetaConnections(user: AuthUser) {
  const connections = await prisma.meta_connections.findMany({ where: connectionScope(user), orderBy: [{ updated_at: "desc" }, { id: "asc" }] });
  return {
    data: connections.map(serializeConnection),
    configuration: {
      appIdConfigured: Boolean(env.META_APP_ID),
      appSecretConfigured: Boolean(env.META_APP_SECRET),
      verifyTokenConfigured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN),
      encryptionKeyConfigured: Boolean(env.META_TOKEN_ENCRYPTION_KEY),
      oauthRedirectUriConfigured: Boolean(env.META_OAUTH_REDIRECT_URI),
      graphApiVersion: env.META_GRAPH_API_VERSION,
      gptApiKeyConfigured: Boolean(gptApiKey),
      gptModel: env.GPT_MODEL,
    },
  };
}

export async function startMetaOAuth(user: AuthUser, input: MetaConnectionInput) {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_TOKEN_ENCRYPTION_KEY || !env.META_OAUTH_REDIRECT_URI) {
    throw new Error("Cấu hình OAuth Meta trên máy chủ chưa đầy đủ.");
  }
  await validateConnectionScope(user, input);
  const state = randomBytes(32).toString("base64url");
  await prisma.meta_oauth_sessions.create({
    data: {
      state_hash: stateHash(state),
      institution_program_id: input.institutionProgramId,
      lead_source_id: input.leadSourceId,
      created_by: user.id,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      expires_at: new Date(Date.now() + oauthSessionLifetimeMs),
    },
  });
  return { authorizationUrl: buildMetaAuthorizationUrl({ redirectUri: env.META_OAUTH_REDIRECT_URI, state }) };
}

export async function completeMetaOAuthCallback(state: string, code: string) {
  const session = await prisma.meta_oauth_sessions.findUnique({ where: { state_hash: stateHash(state) } });
  if (!session || session.status !== "pending" || session.expires_at.getTime() <= Date.now()) {
    throw new Error("Phiên kết nối Meta không hợp lệ hoặc đã hết hạn.");
  }
  const token = await exchangeMetaAuthorizationCode(code, session.redirect_uri);
  await prisma.meta_oauth_sessions.update({
    where: { id: session.id },
    data: { user_access_token_encrypted: encryptMetaSecret(token), status: "authorized" },
  });
  return session.id;
}

async function visibleOAuthSession(user: AuthUser, sessionId: string) {
  const session = await prisma.meta_oauth_sessions.findFirst({ where: { id: sessionId, created_by: user.id, status: "authorized", expires_at: { gt: new Date() } } });
  if (!session?.user_access_token_encrypted) throw new Error("Phiên chọn Page không tồn tại hoặc đã hết hạn.");
  return session;
}

export async function listMetaOAuthPages(user: AuthUser, sessionId: string) {
  const session = await visibleOAuthSession(user, sessionId);
  const pages = await getManagedMetaPages(decryptMetaSecret(session.user_access_token_encrypted!));
  return {
    data: pages.map((page) => ({ id: page.id, name: page.name, tasks: page.tasks ?? [], canMessage: (page.tasks ?? []).some((task) => task.includes("MESSAG")) })),
  };
}

export async function connectMetaPage(user: AuthUser, sessionId: string, pageId: string) {
  const session = await visibleOAuthSession(user, sessionId);
  await validateConnectionScope(user, { institutionProgramId: session.institution_program_id, leadSourceId: session.lead_source_id });
  const pages = await getManagedMetaPages(decryptMetaSecret(session.user_access_token_encrypted!));
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error("Page đã chọn không thuộc tài khoản Facebook vừa cấp quyền.");
  if (page.tasks?.length && !page.tasks.some((task) => task.includes("MESSAG"))) {
    throw new Error("Tài khoản Facebook không có quyền quản lý tin nhắn trên Page này.");
  }

  const existing = await prisma.meta_connections.findUnique({ where: { page_id: page.id }, select: { id: true } });
  if (existing) {
    const visible = await prisma.meta_connections.findFirst({ where: { id: existing.id, ...connectionScope(user) }, select: { id: true } });
    if (!visible) throw new Error("Page này đã được kết nối ở một phạm vi khác.");
  }
  await subscribeMetaPage(page.id, page.access_token);
  const connection = await prisma.meta_connections.upsert({
    where: { page_id: page.id },
    update: {
      page_name: page.name,
      page_access_token_encrypted: encryptMetaSecret(page.access_token),
      status: "active",
      webhook_subscribed_at: new Date(),
      last_checked_at: new Date(),
      last_error: null,
      institution_program_id: session.institution_program_id,
      lead_source_id: session.lead_source_id,
      updated_at: new Date(),
    },
    create: {
      page_id: page.id,
      page_name: page.name,
      page_access_token_encrypted: encryptMetaSecret(page.access_token),
      webhook_subscribed_at: new Date(),
      last_checked_at: new Date(),
      institution_program_id: session.institution_program_id,
      lead_source_id: session.lead_source_id,
      created_by: user.id,
    },
  });
  await prisma.$transaction([
    prisma.meta_oauth_sessions.update({ where: { id: session.id }, data: { status: "completed", user_access_token_encrypted: null } }),
    prisma.audit_logs.create({ data: { user_id: user.id, entity_type: "meta_connection", entity_id: connection.id, action: "connect", new_data: { pageId: page.id, pageName: page.name, institutionProgramId: session.institution_program_id, leadSourceId: session.lead_source_id } } }),
  ]);
  return serializeConnection(connection);
}

export async function testMetaConnection(user: AuthUser, id: string) {
  const connection = await prisma.meta_connections.findFirst({ where: { id, ...connectionScope(user) } });
  if (!connection) return null;
  try {
    const page = await getMetaPageInfo(connection.page_id, decryptMetaSecret(connection.page_access_token_encrypted));
    const updated = await prisma.meta_connections.update({ where: { id }, data: { page_name: page.name, status: "active", last_checked_at: new Date(), last_error: null, updated_at: new Date() } });
    return { ok: true, connection: serializeConnection(updated) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.meta_connections.update({ where: { id }, data: { status: "error", last_checked_at: new Date(), last_error: message.slice(0, 2000), updated_at: new Date() } });
    throw error;
  }
}

export async function disconnectMetaConnection(user: AuthUser, id: string) {
  const connection = await prisma.meta_connections.findFirst({ where: { id, ...connectionScope(user) } });
  if (!connection) return null;
  await unsubscribeMetaPage(connection.page_id, decryptMetaSecret(connection.page_access_token_encrypted));
  const updated = await prisma.meta_connections.update({ where: { id }, data: { status: "disconnected", updated_at: new Date() } });
  await prisma.audit_logs.create({ data: { user_id: user.id, entity_type: "meta_connection", entity_id: id, action: "disconnect", old_data: { status: connection.status, pageId: connection.page_id } } });
  return serializeConnection(updated);
}

export async function storeMetaWebhookEvent(item: { pageId: string | null; senderId: string | null; timestamp: number | null; event: MetaMessagingEvent }) {
  if (!item.pageId || !item.senderId || item.event.message?.is_echo) return null;
  const connection = await prisma.meta_connections.findFirst({ where: { page_id: item.pageId, status: "active" } });
  if (!connection) return null;
  const eventType = item.event.message ? "message" : item.event.postback ? "postback" : null;
  if (!eventType) return null;
  const content = item.event.message?.text ?? item.event.postback?.title ?? item.event.postback?.payload ?? null;
  const fallbackId = createHash("sha256").update(`${item.pageId}:${item.senderId}:${item.timestamp}:${eventType}:${content ?? ""}`).digest("hex");
  const messageId = item.event.message?.mid ?? `event-${fallbackId}`;
  const message = await prisma.meta_messages.upsert({
    where: { connection_id_meta_message_id: { connection_id: connection.id, meta_message_id: messageId } },
    update: {},
    create: {
      connection_id: connection.id,
      meta_message_id: messageId,
      sender_psid: item.senderId,
      direction: "inbound",
      event_type: eventType,
      message_text: content,
      sent_at: new Date(item.timestamp ?? Date.now()),
      raw_payload: JSON.parse(JSON.stringify(item.event)) as Prisma.InputJsonValue,
    },
  });
  return { messageId: message.id };
}

async function syncMetaUserProfile(connection: { id: string; page_access_token_encrypted: string }, psid: string) {
  const existing = await prisma.meta_user_profiles.findUnique({ where: { connection_id_sender_psid: { connection_id: connection.id, sender_psid: psid } } });
  if (existing && existing.updated_at.getTime() >= Date.now() - userProfileCacheMs) return existing.display_name;
  try {
    const profile = await getMetaUserProfile(psid, decryptMetaSecret(connection.page_access_token_encrypted));
    const saved = await prisma.meta_user_profiles.upsert({
      where: { connection_id_sender_psid: { connection_id: connection.id, sender_psid: psid } },
      update: { display_name: profile.displayName, last_synced_at: new Date(), last_sync_error: null, updated_at: new Date() },
      create: { connection_id: connection.id, sender_psid: psid, display_name: profile.displayName, last_synced_at: new Date() },
    });
    return saved.display_name;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.meta_user_profiles.upsert({
      where: { connection_id_sender_psid: { connection_id: connection.id, sender_psid: psid } },
      update: { last_sync_error: message.slice(0, 2000), updated_at: new Date() },
      create: { connection_id: connection.id, sender_psid: psid, last_sync_error: message.slice(0, 2000) },
    });
    return existing?.display_name ?? null;
  }
}

export async function processMetaMessage(messageId: string) {
  const message = await prisma.meta_messages.findUnique({ where: { id: messageId } });
  if (!message || message.processing_status !== "pending") return;
  const connection = await prisma.meta_connections.findUnique({ where: { id: message.connection_id } });
  if (!connection || connection.status !== "active") return;
  const profileDisplayName = await syncMetaUserProfile(connection, message.sender_psid);
  const text = message.message_text?.trim() ?? "";
  if (!text) {
    await prisma.meta_messages.update({ where: { id: message.id }, data: { processing_status: "ignored", processed_at: new Date() } });
    return;
  }
  try {
    const latestLeadExtraction = await prisma.meta_lead_extractions.findFirst({
      where: { connection_id: connection.id, sender_psid: message.sender_psid, lead_id: { not: null } },
      orderBy: { created_at: "desc" },
      select: { lead_id: true, extracted_data: true },
    });
    const awaitingExplicitName = Boolean(
      latestLeadExtraction?.lead_id
      && usedProfileNameFallback(latestLeadExtraction.extracted_data),
    );
    const recent = await prisma.meta_messages.findMany({
      where: { connection_id: connection.id, sender_psid: message.sender_psid, sent_at: { gte: new Date(message.sent_at.getTime() - leadExtractionContextWindowMs) } },
      orderBy: { sent_at: "desc" }, take: 10,
      select: { id: true, direction: true, message_text: true, processing_status: true, lead_id: true },
    });
    const hasUnresolvedContext = recent.some((item) => !item.lead_id && ["pending", "needs_review"].includes(item.processing_status) && mayContainLeadInformation(item.message_text ?? ""));
    if (!mayContainLeadInformation(text) && !hasUnresolvedContext && !awaitingExplicitName) {
      await prisma.meta_messages.update({ where: { id: message.id }, data: { processing_status: "ignored", processed_at: new Date() } });
      return;
    }
    const conversation = recent.reverse().map((item) => `${item.direction === "inbound" ? "Ứng viên" : "Nhân viên"}: ${item.message_text ?? ""}`).join("\n");
    const extracted = await extractLeadInformation(conversation);
    const explicitName = extracted.fullName?.trim() || null;

    if (
      awaitingExplicitName
      && latestLeadExtraction?.lead_id
      && explicitName
      && extracted.fullNameFromLatestInboundMessage
      && extracted.confidence >= 0.7
    ) {
      const leadId = latestLeadExtraction.lead_id;
      const updated = await prisma.$transaction(async (tx) => {
        const currentLead = await tx.leads.findFirst({
          where: { id: leadId, deleted_at: null },
          select: { full_name: true },
        });
        if (!currentLead) return false;
        await tx.leads.update({
          where: { id: leadId },
          data: { full_name: explicitName, updated_at: new Date() },
        });
        await tx.lead_activities.create({
          data: { lead_id: leadId, user_id: connection.created_by, type: "meta_information_received", content: "Cập nhật họ tên lead từ tin nhắn Facebook Messenger." },
        });
        await tx.audit_logs.create({
          data: { user_id: connection.created_by, entity_type: "lead", entity_id: leadId, action: "update_name_from_meta", old_data: { fullName: currentLead.full_name }, new_data: { fullName: explicitName, messengerPsid: message.sender_psid } },
        });
        await tx.meta_lead_extractions.create({
          data: {
            connection_id: connection.id,
            sender_psid: message.sender_psid,
            source_message_id: message.id,
            extracted_data: { ...extracted, usedProfileNameFallback: false },
            confidence: extracted.confidence,
            status: "updated",
            lead_id: leadId,
          },
        });
        await tx.meta_messages.update({
          where: { id: message.id },
          data: { processing_status: "completed", lead_id: leadId, processed_at: new Date() },
        });
        return true;
      });
      if (updated) return;
    }

    const inboundConversation = recent.filter((item) => item.direction === "inbound").map((item) => item.message_text ?? "").join("\n");
    const phone = normalizeVietnamPhone(extracted.phone) ?? extractVietnamPhoneFromText(inboundConversation);
    if (!phone) {
      await prisma.$transaction([
        prisma.meta_lead_extractions.create({ data: { connection_id: connection.id, sender_psid: message.sender_psid, source_message_id: message.id, extracted_data: extracted, confidence: extracted.confidence, status: "needs_review" } }),
        prisma.meta_messages.update({ where: { id: message.id }, data: { processing_status: "needs_review", processed_at: new Date() } }),
      ]);
      return;
    }
    const resolvedName = resolveInboundLeadName(explicitName, profileDisplayName, phone);
    const existing = await prisma.leads.findFirst({ where: { phone, deleted_at: null }, select: { id: true } });
    let leadId = existing?.id;
    if (leadId) {
      await prisma.lead_activities.create({ data: { lead_id: leadId, user_id: connection.created_by, type: "meta_information_received", content: "Nhận thêm thông tin ứng viên từ Facebook Messenger." } });
    } else {
      const lead = await prisma.$transaction(async (tx) => {
        const created = await tx.leads.create({
          data: {
            lead_code: `LD-${Date.now().toString(36).toUpperCase()}`,
            full_name: resolvedName.fullName, phone, email: extracted.email?.trim() || null,
            source_id: connection.lead_source_id, institution_program_id: connection.institution_program_id,
            owner_id: connection.created_by,
            note: [`Tạo tự động từ Facebook Messenger (${connection.page_name ?? connection.page_id}).`, extracted.majorText ? `Ngành quan tâm: ${extracted.majorText}` : null, extracted.address ? `Địa chỉ: ${extracted.address}` : null, `Messenger PSID: ${message.sender_psid}`].filter(Boolean).join("\n"),
          }, select: { id: true },
        });
        await tx.lead_activities.create({ data: { lead_id: created.id, user_id: connection.created_by, type: "lead_created", content: "Tạo lead tự động từ tin nhắn Facebook Messenger." } });
        await tx.audit_logs.create({ data: { user_id: connection.created_by, entity_type: "lead", entity_id: created.id, action: "create_from_meta", new_data: { sourceId: connection.lead_source_id, messengerPsid: message.sender_psid, extractionConfidence: extracted.confidence } } });
        return created;
      });
      leadId = lead.id;
    }
    const contextIds = recent.filter((item) => item.id === message.id || (item.processing_status === "needs_review" && !item.lead_id)).map((item) => item.id);
    await prisma.$transaction([
      prisma.meta_lead_extractions.create({ data: { connection_id: connection.id, sender_psid: message.sender_psid, source_message_id: message.id, extracted_data: { ...extracted, resolvedFullName: resolvedName.fullName, usedProfileNameFallback: existing ? false : resolvedName.usedProfileNameFallback }, confidence: extracted.confidence, status: existing ? "linked_existing" : "created", lead_id: leadId } }),
      prisma.meta_messages.updateMany({ where: { id: { in: contextIds } }, data: { processing_status: "completed", lead_id: leadId, processed_at: new Date() } }),
    ]);
    if (!existing) await triggerAutomation("lead_created", { leadId, institutionProgramId: connection.institution_program_id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.meta_messages.update({ where: { id: message.id }, data: { processing_status: "failed", processing_error: errorMessage.slice(0, 2000), processed_at: new Date() } });
    throw error;
  }
}

export async function listMetaProcessingLogs(user: AuthUser, page: number, limit: number) {
  const visible = await prisma.meta_connections.findMany({ where: connectionScope(user), select: { id: true, page_id: true, page_name: true } });
  const connectionIds = visible.map((item) => item.id);
  const [items, total] = await prisma.$transaction([
    prisma.meta_messages.findMany({ where: { connection_id: { in: connectionIds } }, orderBy: [{ sent_at: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.meta_messages.count({ where: { connection_id: { in: connectionIds } } }),
  ]);
  const profiles = items.length ? await prisma.meta_user_profiles.findMany({ where: { connection_id: { in: connectionIds }, sender_psid: { in: [...new Set(items.map((item) => item.sender_psid))] } }, select: { connection_id: true, sender_psid: true, display_name: true } }) : [];
  const names = new Map(profiles.map((profile) => [`${profile.connection_id}:${profile.sender_psid}`, profile.display_name]));
  const pages = new Map(visible.map((connection) => [connection.id, connection]));
  return {
    data: items.map((item) => ({
      id: item.id, metaMessageId: item.meta_message_id, senderPsid: item.sender_psid,
      senderName: names.get(`${item.connection_id}:${item.sender_psid}`) ?? null,
      pageId: pages.get(item.connection_id)?.page_id ?? null, pageName: pages.get(item.connection_id)?.page_name ?? null,
      messageText: item.message_text, eventType: item.event_type, sentAt: item.sent_at.toISOString(),
      processingStatus: item.processing_status, processingError: item.processing_error, leadId: item.lead_id,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
