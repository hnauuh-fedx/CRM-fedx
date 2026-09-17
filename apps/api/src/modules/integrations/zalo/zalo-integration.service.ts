import { createHash, timingSafeEqual } from "node:crypto";

import { env, gptApiKey } from "../../../config/env";
import { prisma } from "../../../database/prisma";
import type { AuthUser } from "../../auth/auth.types";
import { triggerAutomation } from "../../automations/automation-engine.service";
import { decryptZaloSecret, encryptZaloSecret } from "./zalo-crypto";
import { getZaloOaInfo, getZaloUserProfile, refreshZaloOaToken } from "./zalo-api.service";
import { extractLeadInformation, mayContainLeadInformation, normalizeVietnamPhone } from "./zalo-extraction.service";

const refreshSafetyMs = 60 * 60 * 1000;
const leadExtractionContextWindowMs = 15 * 60 * 1000;
const userProfileCacheMs = 7 * 24 * 60 * 60 * 1000;
const userProfileRetryMs = 15 * 60 * 1000;

export type SaveZaloConnectionInput = {
  appId?: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInHours: number;
  refreshTokenExpiresInDays?: number | null;
  institutionProgramId: string;
  leadSourceId: string;
};

function nextRefreshAt(accessTokenExpiresAt: Date) {
  return new Date(Math.max(Date.now() + 60_000, accessTokenExpiresAt.getTime() - refreshSafetyMs));
}

function connectionScope(user: AuthUser) {
  if (user.accessScope === "ALL" || user.permissions.includes("system.manage")) return {};
  if (user.institutionProgramIds.length > 0) {
    return {
      OR: [
        { institution_program_id: { in: user.institutionProgramIds } },
        { created_by: user.id },
      ],
    };
  }
  return { created_by: user.id };
}

function serializeConnection(connection: {
  id: string;
  oa_id: string;
  oa_name: string | null;
  app_id: string;
  status: string;
  institution_program_id: string | null;
  lead_source_id: string;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date | null;
  next_refresh_at: Date;
  last_refresh_at: Date | null;
  last_refresh_error: string | null;
  refresh_failure_count: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: connection.id,
    oaId: connection.oa_id,
    oaName: connection.oa_name,
    appId: connection.app_id,
    status: connection.status,
    institutionProgramId: connection.institution_program_id,
    leadSourceId: connection.lead_source_id,
    accessTokenExpiresAt: connection.access_token_expires_at.toISOString(),
    refreshTokenExpiresAt: connection.refresh_token_expires_at?.toISOString() ?? null,
    nextRefreshAt: connection.next_refresh_at.toISOString(),
    lastRefreshAt: connection.last_refresh_at?.toISOString() ?? null,
    lastRefreshError: connection.last_refresh_error,
    refreshFailureCount: connection.refresh_failure_count,
    createdAt: connection.created_at.toISOString(),
    updatedAt: connection.updated_at.toISOString(),
  };
}

export async function listZaloConnections(user: AuthUser) {
  const connections = await prisma.zalo_connections.findMany({
    where: connectionScope(user),
    orderBy: [{ updated_at: "desc" }, { id: "asc" }],
  });
  return {
    data: connections.map(serializeConnection),
    configuration: {
      appIdConfigured: Boolean(env.ZALO_APP_ID || connections.length > 0),
      appSecretConfigured: Boolean(env.ZALO_APP_SECRET),
      webhookSecretConfigured: Boolean(env.ZALO_OA_SECRET_KEY),
      encryptionKeyConfigured: Boolean(env.ZALO_TOKEN_ENCRYPTION_KEY),
      gptApiKeyConfigured: Boolean(gptApiKey),
      gptModel: env.GPT_MODEL,
    },
  };
}

export async function getZaloConnectionOptions(user: AuthUser) {
  const programWhere = user.accessScope === "ALL" || user.permissions.includes("system.manage")
    ? { status: "active" }
    : { status: "active", id: { in: user.institutionProgramIds } };
  const [leadSources, programs] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: {
        ...(user.institutionProgramIds.length > 0 && user.accessScope !== "ALL"
          ? { OR: [{ institution_program_id: null }, { institution_program_id: { in: user.institutionProgramIds } }] }
          : {}),
      },
      select: { id: true, name: true, type: true, institution_program_id: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.institution_programs.findMany({
      where: programWhere,
      select: { id: true, name: true, institutions: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);
  return {
    leadSources: leadSources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.type,
      institutionProgramId: source.institution_program_id,
    })),
    institutionPrograms: programs.map((program) => ({
      id: program.id,
      name: program.name,
      institutionName: program.institutions.name,
    })),
  };
}

export async function saveManualZaloConnection(user: AuthUser, input: SaveZaloConnectionInput) {
  if (!env.ZALO_TOKEN_ENCRYPTION_KEY) throw new Error("ZALO_TOKEN_ENCRYPTION_KEY chưa được cấu hình.");
  const appId = input.appId?.trim() || env.ZALO_APP_ID;
  if (!appId) throw new Error("ZALO_APP_ID chưa được cấu hình.");

  const [oaInfo, source, program] = await Promise.all([
    getZaloOaInfo(input.accessToken),
    prisma.lead_sources.findUnique({ where: { id: input.leadSourceId }, select: { id: true, institution_program_id: true } }),
    prisma.institution_programs.findFirst({
      where: { id: input.institutionProgramId, status: "active" },
      select: { id: true },
    }),
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

  const existingConnection = await prisma.zalo_connections.findUnique({
    where: { app_id_oa_id: { app_id: appId, oa_id: oaInfo.oaId } },
    select: { id: true },
  });
  if (existingConnection) {
    const visible = await prisma.zalo_connections.findFirst({
      where: { id: existingConnection.id, ...connectionScope(user) },
      select: { id: true },
    });
    if (!visible) throw new Error("Bạn không có phạm vi cập nhật kết nối Zalo OA này.");
  }

  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + input.accessTokenExpiresInHours * 60 * 60 * 1000);
  const refreshTokenExpiresAt = input.refreshTokenExpiresInDays
    ? new Date(now + input.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const encryptedAccessToken = encryptZaloSecret(input.accessToken.trim());
  const encryptedRefreshToken = encryptZaloSecret(input.refreshToken.trim());
  const connection = await prisma.zalo_connections.upsert({
    where: { app_id_oa_id: { app_id: appId, oa_id: oaInfo.oaId } },
    update: {
      oa_name: oaInfo.oaName,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      next_refresh_at: nextRefreshAt(accessTokenExpiresAt),
      institution_program_id: input.institutionProgramId,
      lead_source_id: input.leadSourceId,
      status: "active",
      last_refresh_error: null,
      refresh_failure_count: 0,
      token_version: { increment: 1 },
      updated_at: new Date(),
    },
    create: {
      oa_id: oaInfo.oaId,
      oa_name: oaInfo.oaName,
      app_id: appId,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      next_refresh_at: nextRefreshAt(accessTokenExpiresAt),
      institution_program_id: input.institutionProgramId,
      lead_source_id: input.leadSourceId,
      created_by: user.id,
    },
  });
  await prisma.audit_logs.create({
    data: {
      user_id: user.id,
      entity_type: "zalo_connection",
      entity_id: connection.id,
      action: "connect",
      new_data: {
        oaId: connection.oa_id,
        oaName: connection.oa_name,
        leadSourceId: connection.lead_source_id,
        institutionProgramId: connection.institution_program_id,
      },
    },
  });
  return serializeConnection(connection);
}

export async function findVisibleZaloConnection(user: AuthUser, id: string) {
  return prisma.zalo_connections.findFirst({ where: { id, ...connectionScope(user) } });
}

export async function testZaloConnection(user: AuthUser, id: string) {
  const connection = await findVisibleZaloConnection(user, id);
  if (!connection) return null;
  const oaInfo = await getZaloOaInfo(decryptZaloSecret(connection.access_token_encrypted));
  await prisma.zalo_connections.update({
    where: { id },
    data: { oa_name: oaInfo.oaName, status: "active", last_refresh_error: null, updated_at: new Date() },
  });
  return { ok: true, ...oaInfo };
}

export async function refreshZaloConnection(id: string) {
  const connection = await prisma.zalo_connections.findUnique({ where: { id } });
  if (!connection) return null;
  try {
    const refreshed = await refreshZaloOaToken(decryptZaloSecret(connection.refresh_token_encrypted), connection.app_id);
    const now = Date.now();
    const accessTokenExpiresAt = new Date(now + refreshed.expiresIn * 1000);
    const refreshTokenExpiresAt = refreshed.refreshTokenExpiresIn
      ? new Date(now + refreshed.refreshTokenExpiresIn * 1000)
      : connection.refresh_token_expires_at;
    const updated = await prisma.zalo_connections.updateMany({
      where: { id, token_version: connection.token_version },
      data: {
        access_token_encrypted: encryptZaloSecret(refreshed.accessToken),
        refresh_token_encrypted: encryptZaloSecret(refreshed.refreshToken),
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        next_refresh_at: nextRefreshAt(accessTokenExpiresAt),
        last_refresh_at: new Date(),
        last_refresh_error: null,
        refresh_failure_count: 0,
        status: "active",
        token_version: { increment: 1 },
        updated_at: new Date(),
      },
    });
    if (updated.count === 0) throw new Error("Token đã được một worker khác làm mới.");
    return prisma.zalo_connections.findUnique({ where: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.zalo_connections.update({
      where: { id },
      data: {
        status: "error",
        last_refresh_error: message.slice(0, 2000),
        refresh_failure_count: { increment: 1 },
        updated_at: new Date(),
      },
    });
    throw error;
  }
}

export async function disconnectZaloConnection(user: AuthUser, id: string) {
  const connection = await findVisibleZaloConnection(user, id);
  if (!connection) return null;
  const updated = await prisma.zalo_connections.update({
    where: { id },
    data: { status: "disconnected", updated_at: new Date() },
  });
  await prisma.audit_logs.create({
    data: { user_id: user.id, entity_type: "zalo_connection", entity_id: id, action: "disconnect", old_data: { status: connection.status } },
  });
  return serializeConnection(updated);
}

export function verifyZaloWebhookSignature(rawBody: string, signature: string | undefined, payload: { app_id?: string; timestamp?: string | number }) {
  const webhookSecret = env.ZALO_OA_SECRET_KEY;
  if (!webhookSecret || !payload.app_id || !payload.timestamp || !signature) return false;
  const expected = createHash("sha256")
    .update(`${payload.app_id}${rawBody}${payload.timestamp}${webhookSecret}`, "utf8")
    .digest("hex");
  const received = signature.replace(/^mac=/i, "").trim().toLowerCase();
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export type ZaloWebhookPayload = {
  app_id?: string;
  sender?: { id?: string | number };
  recipient?: { id?: string | number };
  event_name?: string;
  message?: { text?: string; msg_id?: string | number };
  timestamp?: string | number;
};

export function isZaloWebhookValidationRequest(payload: ZaloWebhookPayload, userAgent?: string) {
  const timestamp = Number(payload.timestamp);
  const timestampIsRecent = Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= 10 * 60 * 1000;

  return userAgent === "ZaloWebhook"
    && payload.app_id === env.ZALO_APP_ID
    && payload.event_name === "user_send_text"
    && payload.message?.msg_id === "This is message id"
    && payload.message?.text === "This is testing message"
    && timestampIsRecent;
}

export async function storeZaloWebhookMessage(payload: ZaloWebhookPayload) {
  const appId = String(payload.app_id ?? "");
  const oaId = String(payload.recipient?.id ?? "");
  const zaloUserId = String(payload.sender?.id ?? "");
  const zaloMessageId = String(payload.message?.msg_id ?? "");
  if (!appId || !oaId || !zaloUserId || !zaloMessageId || payload.event_name !== "user_send_text") return null;
  const connection = await prisma.zalo_connections.findFirst({ where: { app_id: appId, oa_id: oaId, status: "active" } });
  if (!connection) return null;
  const message = await prisma.zalo_messages.upsert({
    where: { connection_id_zalo_message_id: { connection_id: connection.id, zalo_message_id: zaloMessageId } },
    update: {},
    create: {
      connection_id: connection.id,
      zalo_message_id: zaloMessageId,
      zalo_user_id: zaloUserId,
      direction: "inbound",
      event_name: payload.event_name,
      message_type: "text",
      message_text: payload.message?.text ?? null,
      sent_at: new Date(Number(payload.timestamp) || Date.now()),
      raw_payload: JSON.parse(JSON.stringify(payload)),
    },
  });
  return { connectionId: connection.id, messageId: message.id };
}

async function syncZaloUserProfile(connection: {
  id: string;
  access_token_encrypted: string;
}, zaloUserId: string) {
  const existing = await prisma.zalo_user_profiles.findUnique({
    where: { connection_id_zalo_user_id: { connection_id: connection.id, zalo_user_id: zaloUserId } },
  });
  const cacheDuration = existing?.display_name ? userProfileCacheMs : userProfileRetryMs;
  if (existing && existing.updated_at.getTime() >= Date.now() - cacheDuration) return existing.display_name;

  try {
    const profile = await getZaloUserProfile(decryptZaloSecret(connection.access_token_encrypted), zaloUserId);
    const saved = await prisma.zalo_user_profiles.upsert({
      where: { connection_id_zalo_user_id: { connection_id: connection.id, zalo_user_id: zaloUserId } },
      update: {
        display_name: profile.displayName,
        last_synced_at: new Date(),
        last_sync_error: null,
        updated_at: new Date(),
      },
      create: {
        connection_id: connection.id,
        zalo_user_id: zaloUserId,
        display_name: profile.displayName,
        last_synced_at: new Date(),
      },
    });
    return saved.display_name;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.zalo_user_profiles.upsert({
      where: { connection_id_zalo_user_id: { connection_id: connection.id, zalo_user_id: zaloUserId } },
      update: { last_sync_error: errorMessage.slice(0, 2000), updated_at: new Date() },
      create: {
        connection_id: connection.id,
        zalo_user_id: zaloUserId,
        last_sync_error: errorMessage.slice(0, 2000),
      },
    });
    return existing?.display_name ?? null;
  }
}

export async function syncRecentZaloUserProfiles(limit = 100) {
  const conversations = await prisma.zalo_messages.findMany({
    orderBy: { sent_at: "desc" },
    distinct: ["connection_id", "zalo_user_id"],
    take: limit,
    select: { connection_id: true, zalo_user_id: true },
  });
  const connectionIds = [...new Set(conversations.map((item) => item.connection_id))];
  const connections = await prisma.zalo_connections.findMany({
    where: { id: { in: connectionIds }, status: "active" },
    select: { id: true, access_token_encrypted: true },
  });
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));

  for (let index = 0; index < conversations.length; index += 5) {
    const batch = conversations.slice(index, index + 5);
    await Promise.all(batch.map((conversation) => {
      const connection = connectionsById.get(conversation.connection_id);
      return connection
        ? syncZaloUserProfile(connection, conversation.zalo_user_id)
        : Promise.resolve(null);
    }));
  }
}

export async function processZaloMessage(messageId: string) {
  const message = await prisma.zalo_messages.findUnique({ where: { id: messageId } });
  if (!message || message.processing_status !== "pending") return;
  const connection = await prisma.zalo_connections.findUnique({ where: { id: message.connection_id } });
  if (!connection || connection.status === "disconnected") return;
  await syncZaloUserProfile(connection, message.zalo_user_id);
  const text = message.message_text?.trim() ?? "";
  if (!text) {
    await prisma.zalo_messages.update({ where: { id: message.id }, data: { processing_status: "ignored", processed_at: new Date() } });
    return;
  }

  try {
    const recent = await prisma.zalo_messages.findMany({
      where: {
        connection_id: connection.id,
        zalo_user_id: message.zalo_user_id,
        sent_at: { gte: new Date(message.sent_at.getTime() - leadExtractionContextWindowMs) },
      },
      orderBy: { sent_at: "desc" },
      take: 10,
      select: {
        id: true,
        direction: true,
        message_text: true,
        sent_at: true,
        processing_status: true,
        lead_id: true,
      },
    });
    const hasUnresolvedPhoneContext = recent.some((item) =>
      !item.lead_id
      && (item.processing_status === "pending" || item.processing_status === "needs_review")
      && mayContainLeadInformation(item.message_text ?? ""),
    );
    if (!mayContainLeadInformation(text) && !hasUnresolvedPhoneContext) {
      await prisma.zalo_messages.update({
        where: { id: message.id },
        data: { processing_status: "ignored", processed_at: new Date() },
      });
      return;
    }
    const conversation = recent.reverse().map((item) =>
      `${item.direction === "inbound" ? "Ứng viên" : "Nhân viên"}: ${item.message_text ?? ""}`,
    ).join("\n");
    const extracted = await extractLeadInformation(conversation);
    const phone = normalizeVietnamPhone(extracted.phone);
    if (!extracted.isLeadInformation || !extracted.fullName?.trim() || !phone || extracted.confidence < 0.7) {
      await prisma.$transaction([
        prisma.zalo_lead_extractions.create({
          data: {
            connection_id: connection.id,
            zalo_user_id: message.zalo_user_id,
            source_message_id: message.id,
            extracted_data: extracted,
            confidence: extracted.confidence,
            status: "needs_review",
          },
        }),
        prisma.zalo_messages.update({ where: { id: message.id }, data: { processing_status: "needs_review", processed_at: new Date() } }),
      ]);
      return;
    }

    const existing = await prisma.leads.findFirst({ where: { phone, deleted_at: null }, select: { id: true } });
    let leadId = existing?.id;
    if (leadId) {
      await prisma.lead_activities.create({
        data: { lead_id: leadId, user_id: connection.created_by, type: "zalo_information_received", content: "Nhận thêm thông tin ứng viên từ Zalo OA." },
      });
    } else {
      const noteParts = [
        `Tạo tự động từ Zalo OA (${connection.oa_name ?? connection.oa_id}).`,
        extracted.majorText ? `Ngành quan tâm: ${extracted.majorText}` : null,
        extracted.address ? `Địa chỉ: ${extracted.address}` : null,
        `Zalo user ID: ${message.zalo_user_id}`,
      ].filter(Boolean);
      const lead = await prisma.$transaction(async (tx) => {
        const created = await tx.leads.create({
          data: {
            lead_code: `LD-${Date.now().toString(36).toUpperCase()}`,
            full_name: extracted.fullName!.trim(),
            phone,
            email: extracted.email?.trim() || null,
            source_id: connection.lead_source_id,
            institution_program_id: connection.institution_program_id,
            owner_id: connection.created_by,
            status: "new",
            note: noteParts.join("\n"),
          },
          select: { id: true },
        });
        await tx.lead_activities.create({
          data: { lead_id: created.id, user_id: connection.created_by, type: "lead_created", content: "Tạo lead tự động từ tin nhắn Zalo OA." },
        });
        await tx.audit_logs.create({
          data: {
            user_id: connection.created_by,
            entity_type: "lead",
            entity_id: created.id,
            action: "create_from_zalo",
            new_data: { sourceId: connection.lead_source_id, zaloUserId: message.zalo_user_id, extractionConfidence: extracted.confidence },
          },
        });
        return created;
      });
      leadId = lead.id;
    }

    const contextMessageIds = recent
      .filter((item) => item.id === message.id || (item.processing_status === "needs_review" && !item.lead_id))
      .map((item) => item.id);
    const contextStartedAt = new Date(message.sent_at.getTime() - leadExtractionContextWindowMs);
    await prisma.$transaction([
      prisma.zalo_lead_extractions.create({
        data: {
          connection_id: connection.id,
          zalo_user_id: message.zalo_user_id,
          source_message_id: message.id,
          extracted_data: extracted,
          confidence: extracted.confidence,
          status: existing ? "linked_existing" : "created",
          lead_id: leadId,
        },
      }),
      prisma.zalo_messages.updateMany({
        where: { id: { in: contextMessageIds } },
        data: { processing_status: "completed", lead_id: leadId, processed_at: new Date() },
      }),
      prisma.zalo_lead_extractions.updateMany({
        where: {
          connection_id: connection.id,
          zalo_user_id: message.zalo_user_id,
          status: "needs_review",
          created_at: { gte: contextStartedAt },
        },
        data: { status: "resolved", lead_id: leadId },
      }),
    ]);
    if (!existing) {
      await triggerAutomation("lead_created", { leadId, institutionProgramId: connection.institution_program_id ?? undefined });
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await prisma.zalo_messages.update({
      where: { id: message.id },
      data: { processing_status: "failed", processing_error: messageText.slice(0, 2000), processed_at: new Date() },
    });
    throw error;
  }
}

export async function listZaloProcessingLogs(user: AuthUser, page: number, limit: number) {
  const visibleConnections = await prisma.zalo_connections.findMany({ where: connectionScope(user), select: { id: true } });
  const connectionIds = visibleConnections.map((item) => item.id);
  const where = { connection_id: { in: connectionIds } };
  const [items, total] = await prisma.$transaction([
    prisma.zalo_messages.findMany({
      where,
      orderBy: [{ sent_at: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, connection_id: true, zalo_message_id: true, zalo_user_id: true, message_text: true, sent_at: true,
        processing_status: true, processing_error: true, lead_id: true,
      },
    }),
    prisma.zalo_messages.count({ where }),
  ]);
  const profiles = items.length === 0
    ? []
    : await prisma.zalo_user_profiles.findMany({
        where: {
          connection_id: { in: [...new Set(items.map((item) => item.connection_id))] },
          zalo_user_id: { in: [...new Set(items.map((item) => item.zalo_user_id))] },
        },
        select: { connection_id: true, zalo_user_id: true, display_name: true },
      });
  const profileNames = new Map(
    profiles.map((profile) => [`${profile.connection_id}:${profile.zalo_user_id}`, profile.display_name]),
  );
  return {
    data: items.map((item) => ({
      id: item.id,
      zaloMessageId: item.zalo_message_id,
      zaloUserId: item.zalo_user_id,
      zaloUserName: profileNames.get(`${item.connection_id}:${item.zalo_user_id}`) ?? null,
      messageText: item.message_text,
      sentAt: item.sent_at.toISOString(),
      processingStatus: item.processing_status,
      processingError: item.processing_error,
      leadId: item.lead_id,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
