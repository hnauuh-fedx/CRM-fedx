import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import { getCampaignFilterOptions, listCampaigns } from "./campaign-list.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { createCampaign, deleteCampaign, updateCampaign } from "./campaign-management.service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  type: z.string().trim().max(100).optional().transform((value) => value || undefined),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "startDate", "budget"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const campaignIdSchema = z.uuid();
const bodySchema = z.object({
  name: z.string().trim().min(2).max(255),
  type: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["planning", "active", "paused", "completed"]),
  startDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  endDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  budget: z.number().min(0).max(1_000_000_000_000),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
}).refine((input) => !input.startDate || !input.endDate || input.endDate >= input.startDate, {
  path: ["endDate"],
  message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
});

export const campaignsRouter = Router();

campaignsRouter.get(
  "/",
  requireAuthentication,
  requireAnyPermission("campaign.view_all", "campaign.view", "campaign.view_own"),
  async (request, response, next) => {
    try {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách chiến dịch không hợp lệ." });
        return;
      }

      response.json(await listCampaigns(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);

campaignsRouter.get(
  "/options",
  requireAuthentication,
  requireAnyPermission("campaign.view_all", "campaign.view", "campaign.view_own"),
  async (request, response, next) => {
    try {
      response.json(await getCampaignFilterOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

campaignsRouter.post(
  "/",
  requireAuthentication,
  requireAnyPermission("campaign.create"),
  async (request, response, next) => {
    try {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Dữ liệu tạo chiến dịch không hợp lệ." });
        return;
      }
      const selectedProgramId = getInstitutionProgramScope(request);
      const result = await createCampaign(
        request.authUser!,
        { ...parsed.data, institutionProgramId: selectedProgramId ?? parsed.data.institutionProgramId },
        request.ip,
      );
      if (!result.ok) {
        response.status(400).json({ message: "Chương trình đã chọn không tồn tại." });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

campaignsRouter.patch(
  "/:id",
  requireAuthentication,
  requireAnyPermission("campaign.update", "campaign.update_own"),
  async (request, response, next) => {
    try {
      const parsedId = campaignIdSchema.safeParse(request.params.id);
      const parsedBody = bodySchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu cập nhật chiến dịch không hợp lệ." });
        return;
      }
      const selectedProgramId = getInstitutionProgramScope(request);
      const result = await updateCampaign(
        request.authUser!,
        parsedId.data,
        { ...parsedBody.data, institutionProgramId: selectedProgramId ?? parsedBody.data.institutionProgramId },
        request.ip,
      );
      if (!result.ok) {
        response.status(result.reason === "campaign_not_found" ? 404 : 400).json({
          message: result.reason === "campaign_not_found"
            ? "Không tìm thấy chiến dịch trong phạm vi được quản lý."
            : "Chương trình đã chọn không tồn tại.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

campaignsRouter.delete(
  "/:id",
  requireAuthentication,
  requireAnyPermission("campaign.delete"),
  async (request, response, next) => {
    try {
      const parsedId = campaignIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã chiến dịch không hợp lệ." });
        return;
      }
      const result = await deleteCampaign(request.authUser!, parsedId.data, request.ip);
      if (!result.ok) {
        response.status(result.reason === "campaign_not_found" ? 404 : 409).json({
          message: result.reason === "campaign_not_found"
            ? "Không tìm thấy chiến dịch trong phạm vi được quản lý."
            : "Không thể xóa chiến dịch đã có biểu mẫu hoặc dữ liệu UTM.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);
