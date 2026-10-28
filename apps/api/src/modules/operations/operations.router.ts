import { Router } from "express";
import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import { prisma } from "../../database/prisma";
import type { MonitorDocument } from "./operations-monitor";

export const operationsRouter = Router();
operationsRouter.use(requireAuthentication, requireAnyPermission("system.manage"));
operationsRouter.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.authUser!.accessScope !== "ALL") { res.status(403).json({ message: "Giám sát hạ tầng yêu cầu phạm vi toàn hệ thống." }); return; }
  try {
    const rows = await prisma.$queryRaw<Array<{ value: MonitorDocument; updated_at: Date }>>`SELECT value,updated_at FROM operations_monitor_states WHERE key='main' LIMIT 1`;
    const row = rows[0];
    if (!row) { res.status(503).json({ message: "Chưa có dữ liệu từ tiến trình giám sát." }); return; }
    const stale = Date.now() - row.value.observedAt > row.value.staleAfterMs;
    res.status(stale ? 503 : 200).json({ observedAt: row.value.observedAt, stale, snapshot: row.value.snapshot, incidents: row.value.alerts.incidents, recentEvents: row.value.alerts.history.map(({ id, key, phase, message, at }) => ({ id, key, phase, message, at })), pendingAlerts: row.value.alerts.pending.length });
  } catch { res.status(503).json({ message: "Không thể đọc trạng thái giám sát. Kiểm tra database và migration." }); }
});
