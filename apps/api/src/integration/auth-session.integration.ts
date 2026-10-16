import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../database/prisma";
import { authRouter } from "../modules/auth/auth.router";
import { revokeUserSessions } from "../modules/auth/auth-session.service";

const id = randomUUID(), email = `auth-session-${id}@example.test`, password = "Session-Test-123!";
const app = express(); app.use(express.json()); app.use("/api/auth", authRouter);
async function main() {
let server: ReturnType<typeof app.listen> | undefined;
try {
  await prisma.users.create({ data: { id, email, full_name: "Session integration", password_hash: await hash(password, 4), status: "active" } });
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/auth`;
  const request = async (path: string, options: { body?: unknown; cookie?: string; token?: string; origin?: string; noCsrf?: boolean } = {}) => {
    const response = await fetch(url + path, {
      method: path === "/me" ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(!options.noCsrf ? { "X-CRM-Auth": "1" } : {}),
        ...(options.cookie ? { Cookie: options.cookie } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.origin ? { Origin: options.origin } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await response.json();
    return { status: response.status, payload, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "", setCookie: response.headers.get("set-cookie") ?? "" };
  };
  const login = (rememberDevice = true) => request("/login", { body: { email, password, rememberDevice } });

  assert.equal((await request("/login", { body: { email, password }, origin: "https://untrusted.example" })).status, 403);
  assert.equal((await request("/login", { body: { email, password: "wrong" } })).status, 401);
  const remembered = await login(); assert.equal(remembered.status, 200);
  assert.match(remembered.setCookie, /HttpOnly/i); assert.match(remembered.setCookie, /Max-Age=/i);
  assert.match(remembered.setCookie, /Path=\/api\/auth/i); assert.equal(remembered.payload.refreshToken, undefined);
  assert.equal(remembered.payload.expiresIn <= 900, true);
  const rememberedRow = await prisma.auth_sessions.findUniqueOrThrow({ where: { id: remembered.payload.sessionId } });
  assert.equal(rememberedRow.expires_at, null); assert.ok(!remembered.cookie.includes(rememberedRow.refresh_token_hash));
  assert.equal((await request("/me", { token: remembered.payload.accessToken })).status, 200);
  const legacy = jwt.sign({ sub: id, type: "access" }, env.JWT_SECRET);
  assert.equal((await request("/me", { token: legacy })).status, 401);
  assert.equal((await request("/refresh", { cookie: remembered.cookie, noCsrf: true })).status, 403);
  assert.equal((await request("/refresh", { cookie: remembered.cookie, origin: "https://untrusted.example" })).status, 403);

  // A long period without activity never expires a remembered session.
  await prisma.auth_sessions.update({ where: { id: rememberedRow.id }, data: { created_at: new Date("2000-01-01"), last_used_at: new Date("2000-01-01"), rotated_at: new Date("2000-01-01") } });
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => request("/refresh", { cookie: remembered.cookie })));
  concurrent.forEach((result) => assert.equal(result.status, 200));
  assert.equal(new Set(concurrent.map((result) => result.cookie)).size, 1);
  assert.notEqual(concurrent[0].cookie, remembered.cookie);
  // The predecessor is accepted only in the overlap window.
  await prisma.auth_sessions.update({ where: { id: rememberedRow.id }, data: { rotated_at: new Date(Date.now() - 31_000) } });
  assert.equal((await request("/refresh", { cookie: remembered.cookie })).status, 401);
  assert.equal((await request("/me", { token: concurrent[0].payload.accessToken })).status, 401);
  assert.equal((await prisma.auth_sessions.findUniqueOrThrow({ where: { id: rememberedRow.id } })).revoke_reason, "refresh_reuse");

  const temporary = await login(false); assert.equal(temporary.status, 200);
  assert.doesNotMatch(temporary.setCookie, /Max-Age=|Expires=/i);
  const temporaryRow = await prisma.auth_sessions.findUniqueOrThrow({ where: { id: temporary.payload.sessionId } });
  assert.ok(temporaryRow.expires_at);
  assert.ok(Math.abs(temporaryRow.expires_at.getTime() - temporaryRow.created_at.getTime() - 43_200_000) < 1000);
  await prisma.auth_sessions.update({ where: { id: temporaryRow.id }, data: { expires_at: new Date(Date.now() - 1) } });
  assert.equal((await request("/refresh", { cookie: temporary.cookie })).status, 401);
  assert.equal((await request("/me", { token: temporary.payload.accessToken })).status, 401);

  const single = await login(); const other = await login();
  assert.equal((await request("/logout", { cookie: single.cookie })).status, 200);
  assert.equal((await request("/me", { token: single.payload.accessToken })).status, 401);
  assert.equal((await request("/me", { token: other.payload.accessToken })).status, 200);
  assert.equal((await request("/logout-all", { cookie: other.cookie })).status, 200);
  assert.equal((await request("/me", { token: other.payload.accessToken })).status, 401);

  const disabled = await login();
  await prisma.users.update({ where: { id }, data: { status: "suspended" } });
  assert.equal((await request("/me", { token: disabled.payload.accessToken })).status, 401);
  assert.equal((await request("/refresh", { cookie: disabled.cookie })).status, 401);
  await prisma.users.update({ where: { id }, data: { status: "active" } });
  const changed = await login();
  await prisma.$transaction(async (tx) => {
    await tx.users.update({ where: { id }, data: { password_hash: await hash("new-password", 4) } });
    await revokeUserSessions(tx, id, "password_changed", id);
  });
  assert.equal((await request("/me", { token: changed.payload.accessToken })).status, 401);
  assert.equal((await request("/refresh", { cookie: changed.cookie })).status, 401);
  const audit = await prisma.audit_logs.findMany({ where: { user_id: id, entity_type: "auth_session" } });
  assert.ok(audit.some((entry) => entry.action === "login"));
  assert.ok(audit.some((entry) => entry.action === "revoke"));
  assert.ok(!JSON.stringify(audit).includes("refreshToken"));
  console.log("PASS auth sessions: persistence, expiry, concurrency, reuse, CSRF, revocation, account status and audit");
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await prisma.audit_logs.deleteMany({ where: { user_id: id } });
  await prisma.users.deleteMany({ where: { id } });
  await prisma.$disconnect();
}
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
