import { Router } from "express";
import { z } from "zod";

import { env } from "../../../config/env";
import { requireAnyPermission, requireAuthentication } from "../../../middlewares/auth.middleware";
import {
  completeMetaOAuthCallback, connectMetaPage, disconnectMetaConnection, getMetaConnectionOptions,
  listMetaConnections, listMetaOAuthPages, listMetaProcessingLogs, processMetaMessage,
  startMetaOAuth, storeMetaWebhookEvent, testMetaConnection,
} from "./meta-integration.service";
import { getMetaMessagingEvents, verifyMetaWebhookChallenge, verifyMetaWebhookSignature, type MetaWebhookPayload } from "./meta-webhook.service";
import { enqueueMetaMessage } from "./meta-worker.service";

const connectionInputSchema = z.object({ institutionProgramId: z.uuid(), leadSourceId: z.uuid() });
const idSchema = z.uuid();
const pageIdSchema = z.string().regex(/^\d+$/).min(5).max(100);
export const metaRouter = Router();

metaRouter.get("/webhook", (request, response) => {
  const challenge = verifyMetaWebhookChallenge(request.query as Record<string, unknown>, env.META_WEBHOOK_VERIFY_TOKEN);
  if (challenge === null) { response.sendStatus(403); return; }
  response.status(200).type("text/plain").send(challenge);
});

metaRouter.post("/webhook", async (request, response, next) => {
  try {
    const payload = request.body as MetaWebhookPayload;
    if (!verifyMetaWebhookSignature(request.rawBody ?? JSON.stringify(payload), request.header("x-hub-signature-256"), env.META_APP_SECRET)) {
      response.status(401).json({ message: "Chữ ký webhook Meta không hợp lệ." }); return;
    }
    if (payload.object !== "page") { response.sendStatus(404); return; }
    const events = getMetaMessagingEvents(payload);
    response.sendStatus(200);
    for (const event of events) {
      try {
        const stored = await storeMetaWebhookEvent(event);
        if (stored) {
          const queued = await enqueueMetaMessage(stored.messageId);
          if (!queued) void processMetaMessage(stored.messageId).catch((error) => console.error("Meta message processing failed", error));
        }
      } catch (error) { console.error("Cannot persist Meta webhook event", error); }
    }
  } catch (error) { next(error); }
});

metaRouter.get("/oauth/callback", async (request, response) => {
  const parsed = z.object({ state: z.string().min(20), code: z.string().min(1).optional(), error: z.string().optional(), error_description: z.string().optional() }).safeParse(request.query);
  if (!parsed.success || parsed.data.error || !parsed.data.code) {
    const message = parsed.success ? parsed.data.error_description ?? parsed.data.error ?? "Bạn đã hủy cấp quyền Meta." : "Phản hồi OAuth Meta không hợp lệ.";
    response.redirect(`${env.WEB_ORIGIN}/marketing/kenh-ket-noi/meta?metaError=${encodeURIComponent(message)}`); return;
  }
  try {
    const sessionId = await completeMetaOAuthCallback(parsed.data.state, parsed.data.code);
    response.redirect(`${env.WEB_ORIGIN}/marketing/kenh-ket-noi/meta?metaSession=${encodeURIComponent(sessionId)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể hoàn tất đăng nhập Meta.";
    response.redirect(`${env.WEB_ORIGIN}/marketing/kenh-ket-noi/meta?metaError=${encodeURIComponent(message)}`);
  }
});

metaRouter.use(requireAuthentication, requireAnyPermission("integration.view", "integration.manage"));
metaRouter.get("/", async (request, response, next) => { try { response.json(await listMetaConnections(request.authUser!)); } catch (error) { next(error); } });
metaRouter.get("/options", async (request, response, next) => { try { response.json(await getMetaConnectionOptions(request.authUser!)); } catch (error) { next(error); } });
metaRouter.get("/logs", requireAnyPermission("integration.log.view", "integration.manage"), async (request, response, next) => {
  const parsed = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(request.query);
  if (!parsed.success) { response.status(400).json({ message: "Tham số phân trang không hợp lệ." }); return; }
  try { response.json(await listMetaProcessingLogs(request.authUser!, parsed.data.page, parsed.data.limit)); } catch (error) { next(error); }
});
metaRouter.post("/oauth/start", requireAnyPermission("integration.manage"), async (request, response) => {
  const parsed = connectionInputSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ message: "Chương trình và nguồn lead không hợp lệ.", issues: parsed.error.issues }); return; }
  try { response.json(await startMetaOAuth(request.authUser!, parsed.data)); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Không thể bắt đầu kết nối Meta." }); }
});
metaRouter.get("/oauth/sessions/:id/pages", async (request, response) => {
  const parsed = idSchema.safeParse(request.params.id);
  if (!parsed.success) { response.status(400).json({ message: "Phiên kết nối không hợp lệ." }); return; }
  try { response.json(await listMetaOAuthPages(request.authUser!, parsed.data)); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Không thể tải danh sách Page." }); }
});
metaRouter.post("/oauth/sessions/:id/connect", requireAnyPermission("integration.manage"), async (request, response) => {
  const sessionId = idSchema.safeParse(request.params.id); const pageId = pageIdSchema.safeParse(request.body?.pageId);
  if (!sessionId.success || !pageId.success) { response.status(400).json({ message: "Phiên kết nối hoặc Page không hợp lệ." }); return; }
  try { response.status(201).json(await connectMetaPage(request.authUser!, sessionId.data, pageId.data)); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Không thể kết nối Page." }); }
});
metaRouter.post("/:id/test", requireAnyPermission("integration.manage"), async (request, response) => {
  const parsed = idSchema.safeParse(request.params.id); if (!parsed.success) { response.status(400).json({ message: "ID kết nối không hợp lệ." }); return; }
  try { const result = await testMetaConnection(request.authUser!, parsed.data); if (!result) { response.status(404).json({ message: "Không tìm thấy kết nối Meta." }); return; } response.json(result); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Không thể kiểm tra kết nối Meta." }); }
});
metaRouter.delete("/:id", requireAnyPermission("integration.manage"), async (request, response) => {
  const parsed = idSchema.safeParse(request.params.id); if (!parsed.success) { response.status(400).json({ message: "ID kết nối không hợp lệ." }); return; }
  try { const result = await disconnectMetaConnection(request.authUser!, parsed.data); if (!result) { response.status(404).json({ message: "Không tìm thấy kết nối Meta." }); return; } response.json(result); }
  catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Không thể ngắt kết nối Meta." }); }
});
