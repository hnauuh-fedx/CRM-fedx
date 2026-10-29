import express, { type RequestHandler, type ErrorRequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { deploymentRequestSchema, releaseActorSchema, releasePageSchema, releaseRegistrationSchema } from "@admission-crm/shared/releases";
import { config } from "./config";
import { ControlError, deploymentRow, enqueueDeployment, pool, registerRelease, releaseRow, transaction } from "./store";
import { startRunner } from "./runner";

export function tokenMatches(actual: string | undefined, expected: string) {
  const supplied = Buffer.from(actual ?? ""); const secret = Buffer.from(`Bearer ${expected}`);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}
function authenticate(token: string): RequestHandler {
  return (request, response, next) => {
    if (!tokenMatches(request.header("authorization"), token)) { response.status(401).json({ message: "Không có quyền truy cập dịch vụ triển khai." }); return; }
    next();
  };
}
export function createControlApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use(express.json({ limit: "32kb" }));
  app.post("/v1/releases", authenticate(config.CONTROL_CI_TOKEN), async (req, res) => {
    res.status(201).json(await registerRelease(releaseRegistrationSchema.parse(req.body)));
  });
  // Recovery remains available when the CRM API is unavailable. Access only through a trusted operator channel.
  app.post("/v1/recovery/deployments", authenticate(config.CONTROL_RECOVERY_TOKEN), async (req, res) => {
    const body = z.object({ deployment: deploymentRequestSchema, actor: releaseActorSchema }).strict().parse(req.body);
    res.status(202).json(await enqueueDeployment(body.deployment, body.actor));
  });
  app.post("/v1/recovery/reconcile", authenticate(config.CONTROL_RECOVERY_TOKEN), async (req, res) => {
    const body = z.object({ environment: z.enum(["staging", "production"]), observedReleaseId: z.uuid(), reason: z.string().trim().min(10).max(500), operator: z.string().trim().min(1).max(200) }).strict().parse(req.body);
    if (config.CONTROL_DEPLOYMENT_MODE === "render-cloudflare") {
      const release = (await pool.query("SELECT manifest FROM releases WHERE id=$1", [body.observedReleaseId])).rows[0];
      if (!release) throw new ControlError(404, "Không tìm thấy phiên bản đối soát.");
      const { reconcileCloudRelease } = await import("./cloud-executor.js");
      try { await reconcileCloudRelease(body.environment, release.manifest); } catch { throw new ControlError(409, "Chưa xác minh được đồng nhất phiên bản thực tế trên cloud."); }
    }
    await transaction(async tx => {
      const state = (await tx.query("SELECT * FROM environments WHERE name=$1 FOR UPDATE", [body.environment])).rows[0];
      if (!state?.blocked) throw new ControlError(409, "Môi trường không ở trạng thái cần đối soát.");
      const release = (await tx.query("SELECT * FROM releases WHERE id=$1", [body.observedReleaseId])).rows[0];
      if (!release || release.manifest.schemaGeneration !== state.schema_generation) throw new ControlError(409, "Phiên bản đối soát không tương thích database.");
      // This is an explicit operator attestation, not an automatic claim of deployment success.
      const last = (await tx.query("SELECT id FROM deployments WHERE environment=$1 ORDER BY created_at DESC LIMIT 1", [body.environment])).rows[0];
      if (!last) throw new ControlError(409, "Không tìm thấy lịch sử để đối soát.");
      await tx.query("INSERT INTO deployment_events(deployment_id,message) VALUES($1,$2)", [last.id, `Đối soát bởi ${body.operator}: ${body.reason}; phiên bản quan sát: ${body.observedReleaseId}`]);
      await tx.query("UPDATE environments SET blocked=false,current_release_id=$1 WHERE name=$2", [body.observedReleaseId, body.environment]);
    });
    res.json({ message: "Đã ghi nhận xác nhận của người vận hành." });
  });
  app.use("/v1", authenticate(config.CONTROL_API_TOKEN));
  app.get("/v1/overview", async (_req, res) => {
    const rows = (await pool.query("SELECT e.*,r.manifest->>'version' AS version,(SELECT id FROM deployments d WHERE d.environment=e.name AND d.status IN ('QUEUED','RUNNING') LIMIT 1) AS active_id FROM environments e LEFT JOIN releases r ON r.id=e.current_release_id ORDER BY e.name")).rows;
    res.json({ configured: true, environments: rows.map(row => ({ name: row.name, schemaGeneration: row.schema_generation, currentReleaseId: row.current_release_id, version: row.version, blocked: row.blocked, activeDeploymentId: row.active_id })) });
  });
  for (const kind of ["releases", "deployments"] as const) {
    app.get(`/v1/${kind}`, async (req, res) => {
      const { page, limit, search } = releasePageSchema.parse(req.query);
      const query = kind === "releases" ? "FROM releases r WHERE (r.manifest->>'version' ILIKE $1 OR r.commit ILIKE $1)" : "FROM deployments d JOIN releases r ON r.id=d.release_id WHERE (r.manifest->>'version' ILIKE $1 OR d.actor_name ILIKE $1)";
      const offset = (page - 1) * limit;
      const [count, rows] = await Promise.all([
        pool.query(`SELECT count(*) ${query}`, [`%${search}%`]),
        pool.query(`SELECT ${kind === "releases" ? "r.*" : "d.*,r.manifest"} ${query} ORDER BY ${kind === "releases" ? "r" : "d"}.created_at DESC, ${kind === "releases" ? "r" : "d"}.id DESC LIMIT $2 OFFSET $3`, [`%${search}%`, limit, offset]),
      ]);
      const total = Number(count.rows[0].count);
      res.json({ data: rows.rows.map(kind === "releases" ? releaseRow : deploymentRow), pagination: { page, totalPages: Math.max(1, Math.ceil(total / limit)), total } });
    });
  }
  app.get("/v1/deployments/:id/events", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { page, limit } = releasePageSchema.parse(req.query);
    const rows = await pool.query("SELECT id::text,message,created_at AS \"createdAt\" FROM deployment_events WHERE deployment_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3", [id, limit, (page - 1) * limit]);
    res.json({ data: rows.rows });
  });
  app.get("/v1/deployments/:id/components", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const rows = await pool.query("SELECT component,status,provider_deployment_id AS \"providerId\",updated_at AS \"updatedAt\" FROM deployment_components WHERE deployment_id=$1 ORDER BY component", [id]);
    res.json({ data: rows.rows });
  });
  app.post("/v1/deployments", async (req, res) => {
    const body = z.object({ deployment: deploymentRequestSchema, actor: releaseActorSchema }).strict().parse(req.body);
    res.status(202).json(await enqueueDeployment(body.deployment, body.actor));
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ message: "Dữ liệu không hợp lệ." }); return; }
    if (error instanceof ControlError) { res.status(error.status).json({ message: error.message }); return; }
    console.error("Control request failed.");
    res.status(503).json({ message: "Dịch vụ triển khai chưa sẵn sàng. Vui lòng kiểm tra lại trạng thái yêu cầu." });
  };
  app.use(errors);
  return app;
}
async function main() {
  await pool.query("SELECT 1 FROM environments LIMIT 1");
  const stop = config.CONTROL_DEPLOYMENT_MODE === "prepare-only" ? async () => {} : await startRunner();
  const server = createControlApp().listen(config.CONTROL_PORT, config.CONTROL_BIND_HOST);
  let closing = false;
  const shutdown = async () => {
    if (closing) return; closing = true;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await stop(); await pool.end();
  };
  process.on("SIGTERM", () => void shutdown()); process.on("SIGINT", () => void shutdown());
}
if (process.env.NODE_ENV !== "test") void main().catch(() => { console.error("Release controller startup failed."); process.exitCode = 1; });
