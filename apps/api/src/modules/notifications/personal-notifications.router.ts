import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env";
import { requireAuthentication } from "../../middlewares/auth.middleware";
import { isAuthSessionActive } from "../auth/auth-session.service";
import { subscribeToPersonalNotifications } from "./notification-realtime.service";
import { hidePersonalNotificationCountdown, listPersonalNotifications, markPersonalNotificationRead } from "./personal-notification.service";

const notificationIdSchema = z.uuid();
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
// Under common proxy idle timeouts (Nginx proxy_read_timeout defaults to 60s).
const streamHeartbeatMs = 25_000;
const streamSessionCheckMs = 60_000;
const streamSignalCoalesceMs = 250;

export const personalNotificationsRouter = Router();

personalNotificationsRouter.use(requireAuthentication);

// Server-Sent Events: tells the user's open pages to refetch their own notifications. Content is
// never pushed; the list endpoint stays the only reader. Polling remains the fallback.
personalNotificationsRouter.get("/stream", (request, response) => {
  const userId = request.authUser!.id;
  const sessionId = request.authSessionId!;
  let signalTimer: NodeJS.Timeout | null = null;
  const timers: NodeJS.Timeout[] = [];
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    if (signalTimer) clearTimeout(signalTimer);
    timers.forEach(clearInterval);
    response.end();
  };
  const signal = () => {
    signalTimer ??= setTimeout(() => {
      signalTimer = null;
      if (!closed) response.write("event: notifications\ndata: {}\n\n");
    }, streamSignalCoalesceMs);
  };

  unsubscribe = subscribeToPersonalNotifications(userId, signal, close);
  if (!unsubscribe) {
    response.status(429).json({ message: "Bạn đang mở quá nhiều trang nhận thông báo cùng lúc." });
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    // Nginx would otherwise buffer the stream until it closes.
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  response.write("retry: 5000\nevent: ready\ndata: {}\n\n");

  timers.push(setInterval(() => { if (!closed) response.write(": ping\n\n"); }, streamHeartbeatMs));
  // Logout or revocation ends the stream within a minute; the access token lifetime caps it.
  timers.push(setInterval(() => {
    void isAuthSessionActive(sessionId, userId).then((active) => { if (!active) close(); }, close);
  }, streamSessionCheckMs));
  timers.push(setTimeout(close, env.JWT_EXPIRES_IN_SECONDS * 1000));
  // Fires when the client disconnects (tab closed, navigation, network loss).
  response.on("close", close);
});

personalNotificationsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách thông báo không hợp lệ." });
      return;
    }
    response.json(await listPersonalNotifications(request.authUser!.id, parsed.data.page, parsed.data.limit));
  } catch (error) {
    next(error);
  }
});

personalNotificationsRouter.patch("/:id/read", async (request, response, next) => {
  try {
    const parsedId = notificationIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã thông báo không hợp lệ." });
      return;
    }
    if (!(await markPersonalNotificationRead(request.authUser!.id, parsedId.data))) {
      response.status(404).json({ message: "Không tìm thấy thông báo." });
      return;
    }
    response.json({ id: parsedId.data });
  } catch (error) {
    next(error);
  }
});

personalNotificationsRouter.patch("/:id/countdown/hide", async (request, response, next) => {
  try {
    const parsedId = notificationIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã thông báo không hợp lệ." });
      return;
    }
    if (!(await hidePersonalNotificationCountdown(request.authUser!.id, parsedId.data))) {
      response.status(404).json({ message: "Không tìm thấy thông báo." });
      return;
    }
    response.json({ id: parsedId.data });
  } catch (error) {
    next(error);
  }
});
