import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hash } from "bcryptjs";
import { Client } from "pg";
import { prisma } from "../database/prisma";

async function main() {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/crm_manual_unassign_test_\d+$/, "Use the isolated test runner");
  const children: ChildProcess[] = [];
  const freePort = async () => {
    const socket = createServer().listen(0, "127.0.0.1"); await once(socket, "listening");
    const address = socket.address(); assert.ok(address && typeof address !== "string");
    await new Promise<void>(resolve => socket.close(() => resolve())); return address.port;
  };
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit"); child.kill("SIGTERM");
    const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await exited; } finally { clearTimeout(deadline); }
  };
  const start = async (extra: Record<string, string> = {}) => {
    const port = await freePort();
    const child = spawn(process.execPath, ["--import", "tsx", "src/api.ts"], {
      env: { ...process.env, NODE_ENV: "test", PORT: String(port), DISABLE_REDIS: "true", DISABLE_AUTOMATION_WORKER: "true", AUTOMATION_PROCESS_ROLE: "api", WEBHOOK_QUEUE_ENABLED: "false", ZALO_QUEUE_ENABLED: "false", META_QUEUE_ENABLED: "false", REMINDER_QUEUE_ENABLED: "false", AUTH_TRUSTED_PROXY_CIDRS: "", AUTH_LOGIN_IP_LIMIT: "100", AUTH_LOGIN_IP_WINDOW_SECONDS: "60", AUTH_LOGIN_ACCOUNT_LIMIT: "3", AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS: "60", ...extra },
      windowsHide: true, stdio: "ignore",
    });
    children.push(child); const url = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error("Test API exited before startup");
      try { if ((await fetch(`${url}/api/health`)).ok) return { child, url }; } catch { /* waiting for startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Test API startup timeout");
  };
  const login = (url: string, email: unknown, password = "wrong-password", forwarded = "192.0.2.1") => fetch(`${url}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": forwarded }, body: JSON.stringify({ email, password }),
  });
  try {
    const migration = new Client({ connectionString: process.env.DATABASE_URL }); await migration.connect();
    try {
      await migration.query("DROP TABLE auth_login_buckets");
      await migration.query(await readFile(path.join(__dirname, "../../prisma/migrations/20261028130000_auth_login_throttling/migration.sql"), "utf8"));
    } finally { await migration.end(); }
    const password = "Login-Fixture-123!", email = "login-protection@example.test";
    await prisma.users.create({ data: { email, full_name: "Login protection fixture", password_hash: await hash(password, 4), status: "active" } });
    let first = await start(); const second = await start();
    const concurrent = await Promise.all(Array.from({ length: 12 }, (_, i) => login(i % 2 ? first.url : second.url, i % 2 ? " Missing@Example.Test " : "missing@example.test", "wrong", `192.0.2.${i + 1}`)));
    assert.equal(concurrent.filter(response => response.status === 401).length, 3, "Shared account budget must be atomic across API instances");
    assert.equal(concurrent.filter(response => response.status === 429).length, 9);
    assert.ok(concurrent.filter(response => response.status === 429).every(response => Number(response.headers.get("retry-after")) > 0));
    await stop(first.child); first = await start();
    assert.equal((await login(first.url, "missing@example.test")).status, 429, "Restart must retain counters");
    for (let i = 0; i < 3; i++) assert.equal((await login(first.url, email)).status, 401);
    const blockedValid = await login(second.url, email, password);
    assert.equal(blockedValid.status, 429); assert.equal(blockedValid.headers.get("set-cookie"), null);
    assert.equal(await prisma.auth_sessions.count(), 0);
    await prisma.auth_login_buckets.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });
    const valid = await login(first.url, email, password); assert.equal(valid.status, 200);
    assert.ok((await valid.json()).accessToken); assert.ok(valid.headers.get("set-cookie"));
    assert.equal(await prisma.auth_sessions.count(), 1);
    await stop(first.child); await stop(second.child); await prisma.auth_login_buckets.deleteMany();
    const source = await start({ AUTH_LOGIN_IP_LIMIT: "2" });
    assert.equal((await login(source.url, {})).status, 400);
    assert.equal((await login(source.url, "other@example.test", "wrong", "192.0.2.2")).status, 401);
    assert.equal((await login(source.url, "another@example.test", "wrong", "192.0.2.3")).status, 429, "Spoofed forwarded headers cannot bypass IP limit");
    await stop(source.child); await prisma.auth_login_buckets.deleteMany();
    const proxy = await start({ AUTH_TRUSTED_PROXY_CIDRS: "127.0.0.1/32", AUTH_LOGIN_IP_LIMIT: "1" });
    assert.equal((await login(proxy.url, "proxy1@example.test", "wrong", "192.0.2.1")).status, 401);
    assert.equal((await login(proxy.url, "proxy2@example.test", "wrong", "192.0.2.2")).status, 401);
    assert.equal((await login(proxy.url, "proxy3@example.test", "wrong", "198.51.100.9, 192.0.2.1")).status, 429, "Use the nearest untrusted address, not a spoofed leftmost value");
    await stop(proxy.child);
    const offline = await start(); await prisma.$executeRaw`ALTER TABLE auth_login_buckets RENAME TO auth_login_buckets_offline`;
    try { assert.equal((await login(offline.url, email, password)).status, 503, "No unprotected fallback when the limiter store fails"); }
    finally { await prisma.$executeRaw`ALTER TABLE auth_login_buckets_offline RENAME TO auth_login_buckets`; }
    assert.equal(await prisma.auth_sessions.count(), 1);
    console.log("PASS: real migration, atomic shared account limits, unknown accounts, restart persistence, expiry recovery, blocked valid passwords without sessions, IP spraying/malformed budgets, untrusted header spoofing, trusted proxy chain, fail-closed store outage.");
  } finally { await Promise.all(children.map(stop)); await prisma.$disconnect(); }
}
void main().catch(error => { console.error("Login protection integration failed:", error); process.exitCode = 1; });
