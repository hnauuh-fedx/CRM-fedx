import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";

export type LoginLimitResult = { allowed: boolean; retryAfterSeconds: number };
export type LoginAttemptConsumer = (ip: string, email?: string) => Promise<LoginLimitResult>;

// URL performs IPv6 canonicalization; group /64 so rotating interface IDs cannot bypass the IP budget.
export function loginIpIdentity(ip: string) {
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return "unknown";
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const parts = right === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  const values = parts.map(part => parseInt(part, 16));
  if (values.slice(0, 5).every(value => value === 0) && values[5] === 65535) {
    return [values[6] >> 8, values[6] & 255, values[7] >> 8, values[7] & 255].join(".");
  }
  return `${values.slice(0, 4).map(value => value.toString(16)).join(":")}::/64`;
}

export function loginBucketKey(kind: "ip" | "account", identity: string) {
  return `${kind}:${createHmac("sha256", env.JWT_SECRET).update(`login-throttle:v1:${kind}:${identity}`).digest("hex")}`;
}

async function reserveBucket(tx: Prisma.TransactionClient, key: string, limit: number, windowSeconds: number): Promise<LoginLimitResult> {
  const [row] = await tx.$queryRaw<Array<{ attempts: number; retry_after: number }>>`
    INSERT INTO auth_login_buckets(key, attempts, expires_at)
    VALUES (${key}, 1, now() + ${windowSeconds}::int * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN auth_login_buckets.expires_at <= now() THEN 1 ELSE LEAST(auth_login_buckets.attempts + 1, ${limit + 1}::int) END,
      expires_at = CASE WHEN auth_login_buckets.expires_at <= now() THEN EXCLUDED.expires_at ELSE auth_login_buckets.expires_at END
    RETURNING attempts, GREATEST(1, ceil(extract(epoch FROM expires_at - now())))::int AS retry_after`;
  return { allowed: row.attempts <= limit, retryAfterSeconds: row.retry_after };
}

export const consumeLoginAttempt: LoginAttemptConsumer = async (ip, email) => {
  // Indexed, bounded cleanup, with SKIP LOCKED for concurrent API replicas.
  await prisma.$executeRaw`
    DELETE FROM auth_login_buckets WHERE key IN (
      SELECT key FROM auth_login_buckets WHERE expires_at <= now()
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )`;
  return prisma.$transaction(async tx => {
    const source = await reserveBucket(tx, loginBucketKey("ip", loginIpIdentity(ip)), env.AUTH_LOGIN_IP_LIMIT, env.AUTH_LOGIN_IP_WINDOW_SECONDS);
    // Do not allocate arbitrary account keys once a source has exhausted its budget.
    if (!source.allowed || !email) return source;
    return reserveBucket(tx, loginBucketKey("account", email.trim().toLowerCase()), env.AUTH_LOGIN_ACCOUNT_LIMIT, env.AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS);
  }, { maxWait: 2000, timeout: 3000 });
};

export function createLoginRateLimitMiddleware(consume: LoginAttemptConsumer = consumeLoginAttempt): RequestHandler {
  return async (request, response, next) => {
    const email = typeof request.body?.email === "string" && request.body.email.length <= 254
      ? request.body.email.trim().toLowerCase() : undefined;
    try {
      const result = await consume(request.ip ?? request.socket.remoteAddress ?? "unknown", email);
      if (result.allowed) { next(); return; }
      response.setHeader("Retry-After", String(result.retryAfterSeconds));
      response.status(429).json({ message: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.", retryAfterSeconds: result.retryAfterSeconds });
      console.warn(JSON.stringify({ event: "auth_login_throttled" }));
    } catch {
      // Never fall back to per-process counters or allow unprotected password checks.
      console.error(JSON.stringify({ event: "auth_login_limiter_unavailable" }));
      response.setHeader("Retry-After", "5");
      response.status(503).json({ message: "Tạm thời không thể đăng nhập. Vui lòng thử lại sau." });
    }
  };
}
