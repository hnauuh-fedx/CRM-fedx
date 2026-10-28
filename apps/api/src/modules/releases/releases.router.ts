import { Router } from "express";
import { z } from "zod";
import { canAccessReleases, deploymentRequestSchema, releasePageSchema } from "@admission-crm/shared/releases";
import { requireAuthentication } from "../../middlewares/auth.middleware";
import { env } from "../../config/env";
import { prisma } from "../../database/prisma";

export const releasesRouter = Router();
releasesRouter.use(requireAuthentication);
releasesRouter.use((request, response, next) => {
  if (!canAccessReleases(request.authUser!, request.method === "POST" ? "deploy" : "view")) {
    response.status(403).json({ message: "Quản lý phiên bản yêu cầu quyền tương ứng và phạm vi toàn hệ thống." }); return;
  }
  response.setHeader("Cache-Control", "no-store"); next();
});
function configured() { return Boolean(env.RELEASE_CONTROL_URL && env.RELEASE_CONTROL_TOKEN); }
async function controlRequest(path: string, body?: unknown) {
  const response = await fetch(`${env.RELEASE_CONTROL_URL!.replace(/\/$/, "")}/v1/${path}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.RELEASE_CONTROL_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  return { status: response.status, payload };
}
releasesRouter.get("/overview", async (_request, response) => {
  if (!configured()) { response.json({ configured: false, environments: [] }); return; }
  try { const result = await controlRequest("overview"); response.status(result.status).json(result.payload); }
  catch { response.status(503).json({ message: "Không thể kết nối dịch vụ triển khai. Vui lòng thử tải lại." }); }
});
for (const kind of ["releases", "deployments"] as const) {
  releasesRouter.get(`/${kind}`, async (request, response) => {
    const parsed = releasePageSchema.safeParse(request.query);
    if (!parsed.success) { response.status(400).json({ message: "Bộ lọc không hợp lệ." }); return; }
    if (!configured()) { response.status(503).json({ message: "Chưa cấu hình dịch vụ triển khai." }); return; }
    const query = new URLSearchParams(Object.entries(parsed.data).map(([key, value]) => [key, String(value)]));
    try { const result = await controlRequest(`${kind}?${query}`); response.status(result.status).json(result.payload); }
    catch { response.status(503).json({ message: "Không thể tải danh sách phiên bản hoặc lịch sử triển khai." }); }
  });
}
releasesRouter.get("/deployments/:id/events", async (request, response) => {
  const id = z.uuid().safeParse(request.params.id); const page = releasePageSchema.safeParse(request.query);
  if (!id.success || !page.success) { response.status(400).json({ message: "Yêu cầu không hợp lệ." }); return; }
  if (!configured()) { response.status(503).json({ message: "Chưa cấu hình dịch vụ triển khai." }); return; }
  try {
    const result = await controlRequest(`deployments/${id.data}/events?page=${page.data.page}&limit=${page.data.limit}`);
    response.status(result.status).json(result.payload);
  } catch { response.status(503).json({ message: "Không thể tải nhật ký triển khai." }); }
});
releasesRouter.post("/deployments", async (request, response, next) => {
  const parsed = deploymentRequestSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Yêu cầu triển khai không hợp lệ." }); return; }
  if (!configured()) { response.status(503).json({ message: "Chưa cấu hình dịch vụ triển khai." }); return; }
  try {
    // Record intent before crossing the network. Completion is durably audited by the controller.
    await prisma.audit_logs.create({ data: {
      user_id: request.authUser!.id, entity_type: "release_deployment", entity_id: parsed.data.requestId,
      action: "request_deployment", old_data: undefined, new_data: parsed.data, ip_address: request.ip,
    } });
    try {
      const result = await controlRequest("deployments", { deployment: parsed.data, actor: { id: request.authUser!.id, name: request.authUser!.fullName } });
      response.status(result.status).json(result.payload);
    } catch {
      response.status(503).json({ message: "Chưa xác nhận máy chủ đã nhận yêu cầu. Tải lại lịch sử hoặc thử lại cùng yêu cầu để tránh triển khai trùng.", requestId: parsed.data.requestId });
    }
  } catch (error) { next(error); }
});
