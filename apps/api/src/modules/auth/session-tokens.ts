import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const temporarySessionMilliseconds = 12 * 60 * 60 * 1000;
export const refreshGraceMilliseconds = 30_000;

export function sessionExpiry(rememberDevice: boolean, now: Date) {
  return rememberDevice ? null : new Date(now.getTime() + temporarySessionMilliseconds);
}

// Domain-separated HMAC lets concurrent refreshes receive the same successor
// without persisting a recoverable refresh token. JWT_SECRET rotation invalidates it.
export function makeRefreshToken(id: string, version: number, secret: string) {
  const value = `${id}.${version}`;
  const signature = createHmac("sha256", secret).update(`crm-refresh-v1:${value}`).digest("base64url");
  return `${value}.${signature}`;
}

export function parseRefreshToken(token: string, secret: string) {
  const [id, versionText, signature, extra] = token.split(".");
  if (extra !== undefined || !z.uuid().safeParse(id).success || !/^(0|[1-9]\d{0,9})$/.test(versionText ?? "")) return null;
  const version = Number(versionText);
  if (!Number.isSafeInteger(version) || version > 2_147_483_646 || !/^[\w-]{43}$/.test(signature ?? "")) return null;
  const expected = makeRefreshToken(id, version, secret);
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return null;
  return { id, version };
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionIsActive(session: { revoked_at: Date | null; expires_at: Date | null }, now: Date) {
  return !session.revoked_at && (!session.expires_at || session.expires_at.getTime() > now.getTime());
}
