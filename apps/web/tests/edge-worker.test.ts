import assert from "node:assert/strict";
import test from "node:test";
import worker, { isApiPath, type EdgeEnv } from "../worker/index";

function createEnv(secret?: string) {
  const assetRequests: string[] = [];
  const env: EdgeEnv = {
    API_ORIGIN: "https://api.example.test",
    EDGE_PROXY_SECRET: secret,
    ASSETS: { fetch: async (request) => { assetRequests.push(new URL(request.url).pathname); return new Response("asset"); } },
  };
  return { env, assetRequests };
}

async function captureUpstream(run: () => Promise<Response>) {
  const original = globalThis.fetch;
  let captured: { request: Request; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: Request, init?: RequestInit) => {
    captured = { request: input, init };
    return new Response(null, { status: 302, headers: { Location: "https://web.example.test/", "Set-Cookie": "admission-crm.refresh=x; Path=/api/auth; HttpOnly" } });
  }) as typeof fetch;
  try { return { response: await run(), captured: captured! }; }
  finally { globalThis.fetch = original; }
}

test("only /api and /api/* are API paths", () => {
  assert.equal(isApiPath("/api"), true);
  assert.equal(isApiPath("/api/auth/refresh"), true);
  assert.equal(isApiPath("/apis"), false);
  assert.equal(isApiPath("/leads"), false);
});

test("non-API paths are served from static assets", async () => {
  const { env, assetRequests } = createEnv();
  const response = await worker.fetch(new Request("https://web.example.test/leads"), env);
  assert.equal(await response.text(), "asset");
  assert.deepEqual(assetRequests, ["/leads"]);
});

test("API requests keep path, query, cookie, origin and body; redirects and Set-Cookie pass through", async () => {
  const { env } = createEnv();
  const { response, captured } = await captureUpstream(() => worker.fetch(new Request("https://web.example.test/api/auth/refresh?x=1", {
    method: "POST", body: "{}", headers: { Cookie: "admission-crm.refresh=abc", Origin: "https://web.example.test", "X-CRM-Auth": "1" },
  }), env));
  assert.equal(captured.request.url, "https://api.example.test/api/auth/refresh?x=1");
  assert.equal(captured.request.method, "POST");
  assert.equal(captured.request.headers.get("cookie"), "admission-crm.refresh=abc");
  assert.equal(captured.request.headers.get("origin"), "https://web.example.test");
  assert.equal(await captured.request.text(), "{}");
  assert.equal(captured.init?.redirect, "manual");
  assert.equal(response.status, 302);
  assert.match(response.headers.get("set-cookie") ?? "", /admission-crm\.refresh/);
});

test("client-supplied edge headers are dropped; the Worker adds them only with a secret", async () => {
  const spoofed = { "X-CRM-Client-IP": "203.0.113.9", "X-CRM-Edge-Secret": "guess", "CF-Connecting-IP": "198.51.100.7" };
  const withoutSecret = await captureUpstream(() => worker.fetch(new Request("https://web.example.test/api/leads", { headers: spoofed }), createEnv().env));
  assert.equal(withoutSecret.captured.request.headers.get("x-crm-client-ip"), null);
  assert.equal(withoutSecret.captured.request.headers.get("x-crm-edge-secret"), null);

  const secret = "s".repeat(32);
  const withSecret = await captureUpstream(() => worker.fetch(new Request("https://web.example.test/api/leads", { headers: spoofed }), createEnv(secret).env));
  assert.equal(withSecret.captured.request.headers.get("x-crm-client-ip"), "198.51.100.7");
  assert.equal(withSecret.captured.request.headers.get("x-crm-edge-secret"), secret);
});
