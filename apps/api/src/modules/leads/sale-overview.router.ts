import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  getSaleFilterOptions,
  getSaleKpi,
  listLeadActivities,
  listLeadAssignments,
  listReminders,
  completeReminder,
  createManualActivity,
  createReminder,
  updateManualActivity,
  updateReminder,
} from "./sale-overview.service";
import { leadListPermissions } from "./lead-list.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";

const pagingSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
};
const assignmentQuerySchema = z.object({
  ...pagingSchema,
  assigneeId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  departmentId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});
const activityQuerySchema = z.object({
  ...pagingSchema,
  type: z.string().trim().max(100).optional().transform((value) => value || undefined),
  userId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});
const reminderQuerySchema = z.object({
  ...pagingSchema,
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  userId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});
const activityBodySchema = z.object({
  leadId: z.uuid(),
  type: z.string().trim().min(2).max(100),
  content: z.string().trim().min(1).max(4000),
});
const activityUpdateBodySchema = activityBodySchema.omit({ leadId: true });
const reminderBodySchema = z.object({
  leadId: z.uuid(),
  title: z.string().trim().min(2).max(255),
  content: z.string().trim().max(4000).optional().transform((value) => value || undefined),
  remindAt: z.iso.datetime({ offset: true }),
});
const reminderUpdateBodySchema = reminderBodySchema.omit({ leadId: true });
const entityIdSchema = z.uuid();

export const saleOverviewRouter = Router();

saleOverviewRouter.use(requireAuthentication);

saleOverviewRouter.get("/options", requireAnyPermission(...leadListPermissions), async (request, response, next) => {
  try {
    response.json(await getSaleFilterOptions(request.authUser!, getInstitutionProgramScope(request)));
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/assignments", requireAnyPermission("lead.view_all"), async (request, response, next) => {
  try {
    const parsed = assignmentQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách phân công không hợp lệ." });
      return;
    }
    response.json(await listLeadAssignments({ ...parsed.data, institutionProgramId: getInstitutionProgramScope(request) }));
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/activities", requireAnyPermission(...leadListPermissions), async (request, response, next) => {
  try {
    const parsed = activityQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách hoạt động không hợp lệ." });
      return;
    }
    response.json(await listLeadActivities(request.authUser!, { ...parsed.data, institutionProgramId: getInstitutionProgramScope(request) }));
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.post("/activities", requireAnyPermission("lead_activity.create"), async (request, response, next) => {
  try {
    const parsed = activityBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Thông tin hoạt động không hợp lệ." });
      return;
    }
    const result = await createManualActivity(request.authUser!, parsed.data, getInstitutionProgramScope(request));
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.patch("/activities/:id", requireAnyPermission("lead_activity.update"), async (request, response, next) => {
  try {
    const parsedId = entityIdSchema.safeParse(request.params.id);
    const parsedBody = activityUpdateBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Thông tin hoạt động không hợp lệ." });
      return;
    }
    const result = await updateManualActivity(request.authUser!, parsedId.data, parsedBody.data, getInstitutionProgramScope(request));
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy hoạt động thủ công trong phạm vi truy cập." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/reminders", requireAnyPermission(...leadListPermissions), async (request, response, next) => {
  try {
    const parsed = reminderQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách nhắc việc không hợp lệ." });
      return;
    }
    response.json(await listReminders(request.authUser!, { ...parsed.data, institutionProgramId: getInstitutionProgramScope(request) }));
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.post("/reminders", requireAnyPermission("reminder.create"), async (request, response, next) => {
  try {
    const parsed = reminderBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Thông tin nhắc việc không hợp lệ." });
      return;
    }
    const result = await createReminder(request.authUser!, parsed.data, getInstitutionProgramScope(request));
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.patch("/reminders/:id", requireAnyPermission("reminder.update"), async (request, response, next) => {
  try {
    const parsedId = entityIdSchema.safeParse(request.params.id);
    const parsedBody = reminderUpdateBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Thông tin nhắc việc không hợp lệ." });
      return;
    }
    const result = await updateReminder(request.authUser!, parsedId.data, parsedBody.data, getInstitutionProgramScope(request));
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy nhắc việc trong phạm vi truy cập." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.patch("/reminders/:id/complete", requireAnyPermission("reminder.complete"), async (request, response, next) => {
  try {
    const parsedId = entityIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã nhắc việc không hợp lệ." });
      return;
    }
    const result = await completeReminder(request.authUser!, parsedId.data, getInstitutionProgramScope(request));
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy nhắc việc trong phạm vi truy cập." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/kpi", requireAnyPermission("lead.view_all"), async (request, response, next) => {
  try {
    response.json(await getSaleKpi(getInstitutionProgramScope(request)));
  } catch (error) {
    next(error);
  }
});
