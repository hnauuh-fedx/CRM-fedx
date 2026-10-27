import { Router, type Request } from "express";
import { z } from "zod";
import { leadChannelInputSchema, leadChannelStatusSchema } from "@admission-crm/shared/lead-channel";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope, InstitutionProgramScopeError } from "../institutions/institution-program-scope";
import {
  createLeadChannel,
  listLeadChannels,
  setLeadChannelStatus,
  updateLeadChannel,
} from "./lead-channel.service";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.enum(["active", "inactive"]).optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const viewPermissions = ["lead_channel.view", "lead_channel.manage"] as const;
const duplicateMessage = "Tên nguồn đã tồn tại trong chương trình đang làm việc.";
const notFoundMessage = "Không tìm thấy nguồn trong chương trình đang làm việc.";

function requireProgram(request: Request) {
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) throw new InstitutionProgramScopeError(400, "Vui lòng chọn chương trình đang làm việc.");
  return institutionProgramId;
}

export const leadChannelsRouter = Router();

leadChannelsRouter.get("/", requireAuthentication, requireAnyPermission(...viewPermissions), async (request, response, next) => {
  try {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách nguồn không hợp lệ." });
      return;
    }
    response.json(await listLeadChannels({ ...parsed.data, institutionProgramId: requireProgram(request) }));
  } catch (error) {
    next(error);
  }
});

leadChannelsRouter.post("/", requireAuthentication, requireAnyPermission("lead_channel.manage"), async (request, response, next) => {
  try {
    const parsed = leadChannelInputSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Thông tin nguồn không hợp lệ." });
      return;
    }
    const result = await createLeadChannel(request.authUser!, parsed.data, requireProgram(request), request.ip);
    if (!result.ok) {
      response.status(result.reason === "duplicate_name" ? 409 : 400).json({
        message: result.reason === "duplicate_name" ? duplicateMessage : "Chương trình đang làm việc không tồn tại hoặc đã ngừng hoạt động.",
      });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

leadChannelsRouter.patch("/:id", requireAuthentication, requireAnyPermission("lead_channel.manage"), async (request, response, next) => {
  try {
    const channelId = z.uuid().safeParse(request.params.id);
    const parsed = leadChannelInputSchema.safeParse(request.body);
    if (!channelId.success || !parsed.success) {
      response.status(400).json({ message: parsed.success ? "Nguồn không hợp lệ." : parsed.error.issues[0]?.message ?? "Thông tin nguồn không hợp lệ." });
      return;
    }
    const result = await updateLeadChannel(request.authUser!, channelId.data, parsed.data, requireProgram(request), request.ip);
    if (!result.ok) {
      response.status(result.reason === "duplicate_name" ? 409 : 404).json({ message: result.reason === "duplicate_name" ? duplicateMessage : notFoundMessage });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

leadChannelsRouter.patch("/:id/status", requireAuthentication, requireAnyPermission("lead_channel.manage"), async (request, response, next) => {
  try {
    const channelId = z.uuid().safeParse(request.params.id);
    const parsed = leadChannelStatusSchema.safeParse(request.body);
    if (!channelId.success || !parsed.success) {
      response.status(400).json({ message: "Trạng thái nguồn không hợp lệ." });
      return;
    }
    const result = await setLeadChannelStatus(request.authUser!, channelId.data, parsed.data.isActive, requireProgram(request), request.ip);
    if (!result.ok) {
      response.status(404).json({ message: notFoundMessage });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
