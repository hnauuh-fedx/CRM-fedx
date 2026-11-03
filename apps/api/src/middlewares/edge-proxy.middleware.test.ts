import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { createEdgeProxyClientIp } from "./edge-proxy.middleware";

const secret = "e".repeat(32);

async function requestIp(configuredSecret: string | undefined, headers: Record<string, string>) {
  const app = express();
  app.use(createEdgeProxyClientIp(configuredSecret));
  app.get("/", (request, response) => {
    response.json({ ip: request.ip, leakedSecret: request.header("x-crm-edge-secret") ?? null });
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`, { headers });
    return await response.json() as { ip: string; leakedSecret: string | null };
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("matching secret replaces request.ip with the Worker client IP and hides the secret", async () => {
  const result = await requestIp(secret, { "X-CRM-Edge-Secret": secret, "X-CRM-Client-IP": "198.51.100.7" });
  assert.deepEqual(result, { ip: "198.51.100.7", leakedSecret: null });
});

test("wrong, missing or unconfigured secret and invalid IPs keep the socket address", async () => {
  for (const [configured, headers] of [
    [secret, { "X-CRM-Edge-Secret": "x".repeat(32), "X-CRM-Client-IP": "198.51.100.7" }],
    [secret, { "X-CRM-Client-IP": "198.51.100.7" }],
    [undefined, { "X-CRM-Edge-Secret": secret, "X-CRM-Client-IP": "198.51.100.7" }],
    [secret, { "X-CRM-Edge-Secret": secret, "X-CRM-Client-IP": "not-an-ip" }],
  ] as const) {
    const result = await requestIp(configured, headers);
    assert.notEqual(result.ip, "198.51.100.7");
    assert.match(result.ip, /127\.0\.0\.1/);
    assert.equal(result.leakedSecret, null);
  }
});
