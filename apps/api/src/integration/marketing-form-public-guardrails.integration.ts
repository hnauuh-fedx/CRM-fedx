import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { prisma } from "../database/prisma";
import { publicMarketingFormsRouter } from "../modules/campaigns/marketing-reference.router";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api/public", publicMarketingFormsRouter);

const server = app.listen(0, "127.0.0.1");

async function post(baseUrl: string, publicKey: string, payload: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/public/forms/${publicKey}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function run() {
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tooManyFields = Object.fromEntries(Array.from({ length: 121 }, (_, index) => [`field_${index}`, "x"]));
  assert.equal((await post(baseUrl, "payload-field-limit", tooManyFields)).status, 400);
  assert.equal((await post(baseUrl, "payload-byte-limit", { value: "x".repeat(65 * 1024) })).status, 400);

  const rateStatuses: number[] = [];
  for (let index = 0; index < 31; index += 1) {
    rateStatuses.push((await post(baseUrl, "rate-limit-fixture", {})).status);
  }
  assert.deepEqual(rateStatuses.slice(0, 30), Array(30).fill(404));
  assert.equal(rateStatuses[30], 429);
  console.log("PASS G5 guardrails: 120 fields, 64 KB payload and 30 requests/minute limits.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  server.close();
  await prisma.$disconnect();
});
