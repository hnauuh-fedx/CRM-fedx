import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { AccessTokenPayload } from "./auth.types";
import { hashRefreshToken, makeRefreshToken, parseRefreshToken, refreshGraceMilliseconds, sessionExpiry, sessionIsActive } from "./session-tokens";

export function issueAccessToken(userId: string, sessionId: string) {
  const payload: AccessTokenPayload = { sub: userId, sid: sessionId, type: "access" };
  return {
    accessToken: jwt.sign(payload, env.JWT_SECRET, { algorithm: "HS256", expiresIn: env.JWT_EXPIRES_IN_SECONDS }),
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  };
}

export async function createAuthSession(userId: string, passwordHash: string, rememberDevice: boolean, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    // Serialize with password/status updates so an old password cannot mint a new session.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.users.findUnique({ where: { id: userId }, select: { password_hash: true, status: true, deleted_at: true } });
    if (!user || user.password_hash !== passwordHash || user.status !== "active" || user.deleted_at) return null;
    const now = new Date();
    const id = randomUUID();
    const refreshToken = makeRefreshToken(id, 0, env.JWT_SECRET);
    const expiresAt = sessionExpiry(rememberDevice, now);
    await tx.auth_sessions.create({ data: {
      id, user_id: userId, remember_device: rememberDevice,
      refresh_token_hash: hashRefreshToken(refreshToken), expires_at: expiresAt,
    } });
    await tx.users.update({ where: { id: userId }, data: { last_login_at: now } });
    await tx.audit_logs.create({ data: {
      user_id: userId, entity_type: "auth_session", entity_id: id,
      action: "login", ip_address: ipAddress, new_data: { method: "password", rememberDevice },
    } });
    return { ...issueAccessToken(userId, id), sessionId: id, refreshToken, rememberDevice, expiresAt };
  });
}

export async function refreshAuthSession(token: string, ipAddress?: string) {
  const parsed = parseRefreshToken(token, env.JWT_SECRET);
  if (!parsed) return null;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${parsed.id}::uuid FOR UPDATE`;
    const session = await tx.auth_sessions.findUnique({ where: { id: parsed.id }, include: { users: { select: { status: true, deleted_at: true } } } });
    const now = new Date();
    if (!session || !sessionIsActive(session, now) || session.users.status !== "active" || session.users.deleted_at) return null;

    if (parsed.version !== session.refresh_version) {
      // A short overlap handles multiple tabs, retries and a lost Set-Cookie response.
      if (parsed.version !== session.refresh_version - 1 || now.getTime() - session.rotated_at.getTime() > refreshGraceMilliseconds) {
        await tx.auth_sessions.update({ where: { id: session.id }, data: { revoked_at: now, revoke_reason: "refresh_reuse" } });
        await tx.audit_logs.create({ data: {
          user_id: session.user_id, entity_type: "auth_session", entity_id: session.id,
          action: "revoke", ip_address: ipAddress, new_data: { reason: "refresh_reuse" },
        } });
        return null;
      }
    } else {
      if (session.refresh_token_hash !== hashRefreshToken(token)) return null;
      // Do not rotate again inside the overlap window: all racing requests converge.
      if (now.getTime() - session.rotated_at.getTime() >= refreshGraceMilliseconds) {
        session.refresh_version += 1;
        session.rotated_at = now;
      }
    }

    const refreshToken = makeRefreshToken(session.id, session.refresh_version, env.JWT_SECRET);
    await tx.auth_sessions.update({ where: { id: session.id }, data: {
      refresh_version: session.refresh_version, rotated_at: session.rotated_at,
      refresh_token_hash: hashRefreshToken(refreshToken), last_used_at: now,
    } });
    return {
      ...issueAccessToken(session.user_id, session.id), userId: session.user_id,
      sessionId: session.id, refreshToken, rememberDevice: session.remember_device, expiresAt: session.expires_at,
    };
  });
}

export async function isAuthSessionActive(sessionId: string, userId: string) {
  const session = await prisma.auth_sessions.findUnique({ where: { id: sessionId }, select: { user_id: true, revoked_at: true, expires_at: true } });
  return Boolean(session && session.user_id === userId && sessionIsActive(session, new Date()));
}

// Called inside account mutations as well as self-service logout. No role bypass.
export async function revokeUserSessions(tx: Prisma.TransactionClient, userId: string, reason: string, actorId: string, ipAddress?: string, sessionId?: string) {
  const result = await tx.auth_sessions.updateMany({
    where: { user_id: userId, revoked_at: null, ...(sessionId ? { id: sessionId } : {}) },
    data: { revoked_at: new Date(), revoke_reason: reason },
  });
  if (result.count) await tx.audit_logs.create({ data: {
    user_id: actorId, entity_type: "auth_session", entity_id: sessionId ?? userId,
    action: "revoke", ip_address: ipAddress, new_data: { reason, userId, count: result.count },
  } });
}

// Self-service change: keeps the current session, signs out every other device.
export async function changeOwnPassword(userId: string, sessionId: string, currentPassword: string, newPassword: string, ipAddress?: string) {
  const user = await prisma.users.findFirst({ where: { id: userId, deleted_at: null, status: "active" }, select: { password_hash: true } });
  if (!user || !user.password_hash.startsWith("$2") || !await compare(currentPassword, user.password_hash)) {
    return { ok: false as const, reason: "invalid_current_password" as const };
  }
  const nextHash = await hash(newPassword, 12);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    // Reject if the password changed between verification and this lock.
    const locked = await tx.users.findUnique({ where: { id: userId }, select: { password_hash: true } });
    if (locked?.password_hash !== user.password_hash) return { ok: false as const, reason: "invalid_current_password" as const };
    await tx.users.update({ where: { id: userId }, data: { password_hash: nextHash, updated_at: new Date() } });
    const revoked = await tx.auth_sessions.updateMany({
      where: { user_id: userId, revoked_at: null, id: { not: sessionId } },
      data: { revoked_at: new Date(), revoke_reason: "password_changed" },
    });
    await tx.audit_logs.create({ data: {
      user_id: userId, entity_type: "user", entity_id: userId, action: "change_password",
      ip_address: ipAddress, new_data: { passwordChanged: true, method: "self_service", revokedSessions: revoked.count },
    } });
    return { ok: true as const };
  });
}

export async function logoutAuthSession(token: string, all: boolean, ipAddress?: string) {
  const parsed = parseRefreshToken(token, env.JWT_SECRET);
  if (!parsed) return;
  await prisma.$transaction(async (tx) => {
    const principal = await tx.auth_sessions.findUnique({ where: { id: parsed.id }, select: { user_id: true } });
    if (!principal) return;
    // All multi-session revocations lock the user before touching session rows.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${principal.user_id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${parsed.id}::uuid FOR UPDATE`;
    const session = await tx.auth_sessions.findUnique({ where: { id: parsed.id } });
    if (!session || !sessionIsActive(session, new Date())) return;
    // Only the current or overlapping predecessor token may revoke sessions.
    if (parsed.version !== session.refresh_version && !(parsed.version === session.refresh_version - 1 && Date.now() - session.rotated_at.getTime() <= refreshGraceMilliseconds)) return;
    await revokeUserSessions(tx, session.user_id, all ? "logout_all" : "logout", session.user_id, ipAddress, all ? undefined : session.id);
  });
}
