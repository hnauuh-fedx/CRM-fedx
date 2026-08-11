import { Router } from "express";
import { z } from "zod";

import { requireAuthentication } from "../../middlewares/auth.middleware";
import { listPersonalNotifications, markPersonalNotificationRead } from "./personal-notification.service";

const notificationIdSchema = z.uuid();
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const personalNotificationsRouter = Router();

personalNotificationsRouter.use(requireAuthentication);

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
