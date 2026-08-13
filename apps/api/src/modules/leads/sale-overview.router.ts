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
import { getSaleCustomFieldDefinitions, getSaleCustomFields } from "./sale-custom-fields.service";

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
  customFieldValues: z.record(z.uuid(), z.unknown().nullable()).optional().default({}),
});
const activityUpdateBodySchema = activityBodySchema.omit({ leadId: true });
const reminderBodySchema = z.object({
  leadId: z.uuid(),
  title: z.string().trim().min(2).max(255),
  content: z.string().trim().max(4000).optional().transform((value) => value || undefined),
  remindAt: z.iso.datetime({ offset: true }),
  customFieldValues: z.record(z.uuid(), z.unknown().nullable()).optional().default({}),
});
const reminderUpdateBodySchema = reminderBodySchema.omit({ leadId: true });
const entityIdSchema = z.uuid();
const customFieldDefinitionQuerySchema = z.object({ leadId: z.uuid().optional() });

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
    const result = await createManualActivity(request.authUser!, { ...parsed.data, customFieldValues: toCustomFieldValueList(parsed.data.customFieldValues) }, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(saleWriteStatus(result.reason)).json({ message: saleWriteMessage(result.reason, "lead") });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/activities/custom-fields", requireAnyPermission("lead_activity.create", "lead_activity.update", ...leadListPermissions), async (request, response, next) => {
  try {
    const parsed = customFieldDefinitionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Lead không hợp lệ." });
      return;
    }
    const canEdit = request.authUser!.permissions.some((permission) => ["lead_activity.create", "lead_activity.update"].includes(permission));
    const data = await getSaleCustomFieldDefinitions(request.authUser!, "SALE_ACTIVITY", parsed.data.leadId, canEdit, getInstitutionProgramScope(request));
    if (!data) {
      response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
      return;
    }
    response.json(data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/activities/:id/custom-fields", requireAnyPermission("lead_activity.update", ...leadListPermissions), async (request, response, next) => {
  try {
    const parsed = entityIdSchema.safeParse(request.params.id);
    if (!parsed.success) {
      response.status(400).json({ message: "Mã hoạt động không hợp lệ." });
      return;
    }
    const canEdit = request.authUser!.permissions.includes("lead_activity.update");
    const data = await getSaleCustomFields(request.authUser!, "SALE_ACTIVITY", parsed.data, canEdit, getInstitutionProgramScope(request));
    if (!data) {
      response.status(404).json({ message: "Không tìm thấy hoạt động trong phạm vi truy cập." });
      return;
    }
    response.json(data);
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
    const result = await updateManualActivity(request.authUser!, parsedId.data, { ...parsedBody.data, customFieldValues: toCustomFieldValueList(parsedBody.data.customFieldValues) }, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(saleWriteStatus(result.reason)).json({ message: saleWriteMessage(result.reason, "activity") });
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
    const result = await createReminder(request.authUser!, { ...parsed.data, customFieldValues: toCustomFieldValueList(parsed.data.customFieldValues) }, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(saleWriteStatus(result.reason)).json({ message: saleWriteMessage(result.reason, "lead") });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/reminders/custom-fields", requireAnyPermission("reminder.create", "reminder.update", ...leadListPermissions), async (request, response, next) => {
  try {
    const parsed = customFieldDefinitionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Lead không hợp lệ." });
      return;
    }
    const canEdit = request.authUser!.permissions.some((permission) => ["reminder.create", "reminder.update"].includes(permission));
    const data = await getSaleCustomFieldDefinitions(request.authUser!, "SALE_REMINDER", parsed.data.leadId, canEdit, getInstitutionProgramScope(request));
    if (!data) {
      response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
      return;
    }
    response.json(data);
  } catch (error) {
    next(error);
  }
});

saleOverviewRouter.get("/reminders/:id/custom-fields", requireAnyPermission("reminder.update", ...leadListPermissions), async (request, response, next) => {
  try {
    const parsed = entityIdSchema.safeParse(request.params.id);
    if (!parsed.success) {
      response.status(400).json({ message: "Mã nhắc việc không hợp lệ." });
      return;
    }
    const canEdit = request.authUser!.permissions.includes("reminder.update");
    const data = await getSaleCustomFields(request.authUser!, "SALE_REMINDER", parsed.data, canEdit, getInstitutionProgramScope(request));
    if (!data) {
      response.status(404).json({ message: "Không tìm thấy nhắc việc trong phạm vi truy cập." });
      return;
    }
    response.json(data);
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
    const result = await updateReminder(request.authUser!, parsedId.data, { ...parsedBody.data, customFieldValues: toCustomFieldValueList(parsedBody.data.customFieldValues) }, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(saleWriteStatus(result.reason)).json({ message: saleWriteMessage(result.reason, "reminder") });
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

function toCustomFieldValueList(values: Record<string, unknown | null>) {
  return Object.entries(values).map(([fieldId, value]) => ({ fieldId, value }));
}

function saleWriteStatus(reason: string) {
  if (reason === "sensitive_forbidden") return 403;
  if (reason === "not_applicable" || reason === "invalid") return 400;
  return 404;
}

function saleWriteMessage(reason: string, target: "lead" | "activity" | "reminder") {
  if (reason === "sensitive_forbidden") return "Bạn không có quyền sửa trường dữ liệu nhạy cảm.";
  if (reason === "not_applicable" || reason === "invalid") return "Không thể lưu trường dữ liệu tùy chỉnh.";
  if (target === "activity") return "Không tìm thấy hoạt động thủ công trong phạm vi truy cập.";
  if (target === "reminder") return "Không tìm thấy nhắc việc trong phạm vi truy cập.";
  return "Không tìm thấy lead trong phạm vi truy cập.";
}
