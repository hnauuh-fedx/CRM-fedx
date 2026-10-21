import { Router, type Response } from "express";
import { z } from "zod";

import { env } from "../../../config/env";
import { prisma } from "../../../database/prisma";
import { requireAnyPermission, requireAuthentication } from "../../../middlewares/auth.middleware";
import { createRedisWebhookRateLimiter } from "../../webhooks/webhook-rate-limit.service";
import { ingestInboundWebhook } from "../../webhooks/webhook-v2.service";
import {
  TikTokApiError, createTikTokMockLead, getTikTokMockLead, isTikTokSandbox, listTikTokLeadForms,
  listTikTokLeadSubscriptions, subscribeTikTokLeads, unsubscribeTikTokLeads,
} from "./tiktok-api.service";
import { extractTikTokLeads, parseTikTokJson } from "./tiktok-lead-webhook";

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const tiktokIdSchema = z.string().regex(/^\d+$/).max(64);
const webhookKeySchema = z.string().min(20).max(100);
const subscribeSchema = z.object({
  callbackUrl: z.url()
    .refine((value) => value.startsWith("https://"), "Callback URL phải dùng HTTPS.")
    .refine((value) => !value.includes("?"), "TikTok không chấp nhận callback URL có query string; đặt secret ở cuối đường dẫn."),
  pageId: tiktokIdSchema.optional(),
});

function sendTikTokError(response: Response, error: unknown, fallback: string) {
  if (error instanceof TikTokApiError) {
    response.status(502).json({ message: error.message, tiktokCode: error.code, requestId: error.requestId });
    return;
  }
  console.error(error);
  response.status(502).json({ message: fallback });
}

const webhookRateLimiter = createRedisWebhookRateLimiter();

export const tiktokRouter = Router();

// Public TikTok lead callback. The URL is registered through /subscriptions and points at an existing
// CRM inbound webhook (program, field mapping, duplicate policy). TikTok cannot send custom headers and
// rejects callback URLs with query parameters, so the webhook secret travels as the last path segment.
tiktokRouter.get(["/webhook/:webhookKey", "/webhook/:webhookKey/:token"], (request, response) => {
  const challenge = typeof request.query.challenge === "string" ? request.query.challenge : null;
  if (challenge) { response.status(200).type("text/plain").send(challenge); return; }
  response.sendStatus(200);
});

tiktokRouter.post(["/webhook/:webhookKey", "/webhook/:webhookKey/:token"], async (request, response, next) => {
  try {
    const key = webhookKeySchema.safeParse(request.params.webhookKey);
    if (!key.success) { response.status(404).json({ success: false }); return; }
    const pathToken: unknown = request.params.token;
    const token = typeof pathToken === "string" ? pathToken : typeof request.query.token === "string" ? request.query.token : undefined;
    let body: unknown = request.body;
    if (request.rawBody) {
      try { body = parseTikTokJson(request.rawBody); } catch { body = request.body; }
    }
    const leads = extractTikTokLeads(body);
    if (!leads.length) {
      // Not a lead event (e.g. a connectivity check); acknowledge so TikTok does not retry.
      console.info(JSON.stringify({ event: "tiktok_webhook_ignored", reason: "missing_lead_id", keys: Object.keys(body ?? {}).slice(0, 30) }));
      response.status(200).json({ success: true, ignored: true });
      return;
    }
    const results = [];
    for (const lead of leads) {
      const result = await ingestInboundWebhook(
        key.data,
        token,
        { ...lead.flat, tiktok_raw: JSON.stringify(lead.raw).slice(0, 20_000) },
        `tiktok:${lead.leadId}`,
        webhookRateLimiter,
        request.ip,
      );
      results.push({ leadId: lead.leadId, result });
    }
    // Any failure is returned so TikTok retries; already-accepted leads are deduplicated by idempotency key.
    const failed = results.find((item) => !item.result.ok);
    if (failed && !failed.result.ok) {
      if (failed.result.retryAfterSeconds) response.setHeader("Retry-After", String(failed.result.retryAfterSeconds));
      response.status(failed.result.status).json({ success: false, leadId: failed.leadId, error: failed.result.error });
      return;
    }
    response.status(200).json({ success: true, data: results.map((item) => ({ leadId: item.leadId, ...(item.result.ok ? item.result.data : {}) })) });
  } catch (error) { next(error); }
});

// Advertiser authorization redirect. The auth_code is useless without the app secret, so the page only
// shows the CLI command that exchanges it; tokens are never rendered in the browser.
tiktokRouter.get("/oauth/callback", (request, response) => {
  const authCode = z.string().regex(/^[A-Za-z0-9_-]{8,200}$/).safeParse(request.query.auth_code);
  const body = authCode.success
    ? `<p>Đã cấp quyền TikTok. Mã có hiệu lực khoảng 1 giờ và chỉ dùng được một lần. Chạy lệnh sau để lấy access token:</p>
<pre>npm run tiktok:exchange-code -w @admission-crm/api -- --code ${authCode.data}</pre>`
    : "<p>Không nhận được auth_code hợp lệ từ TikTok. Vui lòng cấp quyền lại.</p>";
  response.status(authCode.success ? 200 : 400).type("html").send(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Kết nối TikTok</title><body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px">${body}</body></html>`);
});

tiktokRouter.use(requireAuthentication, requireAnyPermission("integration.view", "integration.manage"));

tiktokRouter.get("/status", (_request, response) => {
  response.json({
    environment: isTikTokSandbox() ? "sandbox" : "production",
    appConfigured: Boolean(env.TIKTOK_APP_ID && env.TIKTOK_SECRET),
    accessTokenConfigured: Boolean(env.TIKTOK_ACCESS_TOKEN),
    advertiserId: env.TIKTOK_ADVERTISER_ID ?? null,
  });
});

tiktokRouter.get("/lead-forms", async (request, response) => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) { response.status(400).json({ message: "Tham số phân trang không hợp lệ." }); return; }
  try { response.json(await listTikTokLeadForms(parsed.data.page, parsed.data.pageSize)); }
  catch (error) { sendTikTokError(response, error, "Không thể tải danh sách biểu mẫu TikTok."); }
});

tiktokRouter.get("/lead-forms/:pageId/mock-lead", async (request, response) => {
  const parsed = tiktokIdSchema.safeParse(request.params.pageId);
  if (!parsed.success) { response.status(400).json({ message: "Mã biểu mẫu TikTok không hợp lệ." }); return; }
  try { response.json(await getTikTokMockLead(parsed.data)); }
  catch (error) { sendTikTokError(response, error, "Không thể tải lead thử nghiệm TikTok."); }
});

tiktokRouter.post("/lead-forms/:pageId/mock-lead", requireAnyPermission("integration.manage"), async (request, response) => {
  const parsed = tiktokIdSchema.safeParse(request.params.pageId);
  if (!parsed.success) { response.status(400).json({ message: "Mã biểu mẫu TikTok không hợp lệ." }); return; }
  try { response.status(201).json(await createTikTokMockLead(parsed.data)); }
  catch (error) { sendTikTokError(response, error, "Không thể tạo lead thử nghiệm TikTok."); }
});

tiktokRouter.get("/subscriptions", async (_request, response) => {
  try { response.json(await listTikTokLeadSubscriptions()); }
  catch (error) { sendTikTokError(response, error, "Không thể tải danh sách đăng ký webhook TikTok."); }
});

tiktokRouter.post("/subscriptions", requireAnyPermission("integration.manage"), async (request, response) => {
  const parsed = subscribeSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ message: "Callback URL hoặc mã biểu mẫu không hợp lệ.", issues: parsed.error.issues }); return; }
  try {
    const created = await subscribeTikTokLeads(parsed.data.callbackUrl, parsed.data.pageId);
    await prisma.audit_logs.create({ data: {
      user_id: request.authUser!.id, entity_type: "tiktok_subscription", action: "subscribe",
      new_data: { subscriptionId: created.subscription_id, advertiserId: env.TIKTOK_ADVERTISER_ID ?? null, pageId: parsed.data.pageId ?? null, callbackUrl: parsed.data.callbackUrl.replace(/\/webhook\/([^/]+)\/[^/]+$/, "/webhook/$1/***") },
      ip_address: request.ip,
    } });
    response.status(201).json(created);
  } catch (error) { sendTikTokError(response, error, "Không thể đăng ký webhook lead TikTok."); }
});

tiktokRouter.delete("/subscriptions/:subscriptionId", requireAnyPermission("integration.manage"), async (request, response) => {
  const parsed = tiktokIdSchema.safeParse(request.params.subscriptionId);
  if (!parsed.success) { response.status(400).json({ message: "Mã đăng ký không hợp lệ." }); return; }
  try {
    await unsubscribeTikTokLeads(parsed.data);
    await prisma.audit_logs.create({ data: {
      user_id: request.authUser!.id, entity_type: "tiktok_subscription", action: "unsubscribe", old_data: { subscriptionId: parsed.data }, ip_address: request.ip,
    } });
    response.status(204).end();
  } catch (error) { sendTikTokError(response, error, "Không thể hủy đăng ký webhook lead TikTok."); }
});
