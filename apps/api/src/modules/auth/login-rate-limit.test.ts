import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { createLoginRateLimitMiddleware, loginBucketKey, loginIpIdentity, type LoginAttemptConsumer } from "./login-rate-limit";

test("IP budget canonicalizes mapped IPv4 and groups IPv6 interface addresses by /64", () => {
  assert.equal(loginIpIdentity("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(loginIpIdentity("::ffff:c000:201"), "192.0.2.1");
  assert.equal(loginIpIdentity("2001:0db8:0:1::a"), loginIpIdentity("2001:db8:0:1:ffff:ffff:ffff:ffff"));
  assert.notEqual(loginIpIdentity("2001:db8:0:2::1"), loginIpIdentity("2001:db8:0:1::1"));
  assert.equal(loginIpIdentity("invalid"), "unknown");
  assert.equal(loginIpIdentity("::1"), "0:0:0:0::/64");
});

test("bucket identities are opaque and separated by dimension", () => {
  const key = loginBucketKey("account", "person@example.test");
  assert.ok(!key.includes("person"));
  assert.notEqual(key, loginBucketKey("ip", "person@example.test"));
  assert.equal(key, loginBucketKey("account", "person@example.test"));
});

async function serve(consume: LoginAttemptConsumer, action: (url: string, called: () => number) => Promise<void>) {
  const app = express(); let called = 0;
  app.use(express.json());
  app.post("/login", createLoginRateLimitMiddleware(consume), (_req, res) => { called++; res.json({ ok: true }); });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await action(`http://127.0.0.1:${address.port}/login`, () => called); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("login gate normalizes email, ignores untrusted forwarded IP and precedes password checks", async () => {
  await serve(async (ip, email) => {
    assert.equal(ip, "127.0.0.1"); assert.equal(email, "person@example.test");
    return { allowed: false, retryAfterSeconds: 42 };
  }, async (url, called) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.5" }, body: JSON.stringify({ email: " Person@Example.Test ", password: "unused" }) });
    assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "42");
    assert.equal((await response.json()).retryAfterSeconds, 42); assert.equal(called(), 0);
  });
});

test("limiter failure closes the login gate without checking credentials", async () => {
  await serve(async () => { throw new Error("database unavailable"); }, async (url, called) => {
    const response = await fetch(url, { method: "POST" });
    assert.equal(response.status, 503); assert.equal(response.headers.get("retry-after"), "5"); assert.equal(called(), 0);
    assert.ok(!(await response.text()).includes("database"));
  });
});

test("malformed credentials still consume the source IP budget", async () => {
  await serve(async (_ip, email) => { assert.equal(email, undefined); return { allowed: true, retryAfterSeconds: 1 }; }, async (url, called) => {
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: {} }) })).status, 200);
    assert.equal(called(), 1);
  });
});
