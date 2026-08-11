import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { app } from "../app";
import { prisma } from "../database/prisma";

type JsonRecord = Record<string, unknown>;

const runId = randomUUID().slice(0, 8);
const source = `scope-${runId}`;
let campaignId: string | null = null;
let leadId: string | null = null;

async function request(baseUrl: string, path: string, token: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    status: response.status,
    payload: (await response.json().catch(() => ({}))) as JsonRecord,
  };
}

async function login(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "123456" }),
  });
  const payload = (await response.json()) as JsonRecord;
  assert.equal(response.status, 200, `Không thể đăng nhập tài khoản ${email}.`);
  return payload.accessToken as string;
}

async function verifyUtmAnalytics() {
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const [directorToken, marketingToken] = await Promise.all([
      login(baseUrl, "director@tvu.edu.vn"),
      login(baseUrl, "marketing@tvu.edu.vn"),
    ]);
    const director = await prisma.users.findUniqueOrThrow({
      where: { email: "director@tvu.edu.vn" },
      select: { id: true },
    });
    const campaign = await prisma.campaigns.create({
      data: {
        name: `UTM ngoài phạm vi ${runId}`,
        type: "digital",
        status: "active",
        budget: 12000000,
        created_by: director.id,
      },
      select: { id: true },
    });
    campaignId = campaign.id;
    const lead = await prisma.leads.create({
      data: {
        full_name: `Lead UTM ${runId}`,
        phone: `090${Date.now().toString().slice(-7)}`,
        status: "new",
      },
      select: { id: true },
    });
    leadId = lead.id;
    await prisma.utm_trackings.create({
      data: {
        lead_id: lead.id,
        campaign_id: campaign.id,
        utm_source: source,
        utm_medium: "integration",
        utm_campaign: `campaign-${runId}`,
      },
    });

    const directorAnalytics = await request(
      baseUrl,
      `/utm-trackings/analytics?dimension=source&page=1&limit=20&source=${source}`,
      directorToken,
    );
    assert.equal(directorAnalytics.status, 200);
    assert.equal((directorAnalytics.payload.summary as { leadCount: number }).leadCount, 1);
    assert.equal((directorAnalytics.payload.data as Array<{ source: string }>)[0].source, source);

    const campaignAnalytics = await request(
      baseUrl,
      `/utm-trackings/analytics?dimension=campaign&page=1&limit=20&source=${source}`,
      directorToken,
    );
    assert.equal(campaignAnalytics.status, 200);
    assert.equal((campaignAnalytics.payload.data as Array<{ costPerLead: number }>)[0].costPerLead, 12000000);

    const leadsResponse = await request(
      baseUrl,
      `/utm-trackings/leads?page=1&limit=10&source=${source}&groupSource=${source}`,
      directorToken,
    );
    assert.equal(leadsResponse.status, 200);
    const visibleLead = (leadsResponse.payload.data as Array<JsonRecord>)[0];
    assert.equal(visibleLead.fullName, `Lead UTM ${runId}`);
    assert.equal("phone" in visibleLead, false, "Drill-down không được trả về số điện thoại.");
    assert.equal("email" in visibleLead, false, "Drill-down không được trả về email.");

    const marketingAnalytics = await request(
      baseUrl,
      `/utm-trackings/analytics?dimension=source&page=1&limit=20&source=${source}`,
      marketingToken,
    );
    assert.equal(marketingAnalytics.status, 200);
    assert.equal((marketingAnalytics.payload.summary as { leadCount: number }).leadCount, 0);
    const marketingLeads = await request(
      baseUrl,
      `/utm-trackings/leads?page=1&limit=10&source=${source}&groupSource=${source}`,
      marketingToken,
    );
    assert.equal((marketingLeads.payload.data as unknown[]).length, 0);

    const futureRange = await request(
      baseUrl,
      "/utm-trackings/analytics?dimension=source&page=1&limit=20&fromDate=2099-01-01",
      directorToken,
    );
    assert.equal((futureRange.payload.summary as { trackingCount: number }).trackingCount, 0);
    console.log("UTM analytics verified: metrics, campaign cost, drill-down privacy, date filter and scope.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (leadId) {
      await prisma.leads.deleteMany({ where: { id: leadId } });
    }
    if (campaignId) {
      await prisma.campaigns.deleteMany({ where: { id: campaignId } });
    }
    await prisma.$disconnect();
  }
}

verifyUtmAnalytics().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
