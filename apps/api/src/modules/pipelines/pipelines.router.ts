import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createManagedPipeline,
  createManagedPipelineStage,
  deleteManagedPipeline,
  deleteManagedPipelineStage,
  getPipelineManagementOptions,
  listManagedPipelines,
  updateManagedPipeline,
  updateManagedPipelineStage,
} from "./pipeline-management.service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  module: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "module"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const idSchema = z.uuid();
const pipelineBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  module: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
});
const stageBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  position: z.coerce.number().int().min(0).max(1000),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("")).transform((value) => value || undefined),
  isFinal: z.boolean().default(false),
});

export const pipelinesRouter = Router();

pipelinesRouter.use(requireAuthentication, requireAnyPermission("pipeline.manage"));

function resultMessage(reason: string) {
  if (reason === "pipeline_in_use") return "Không thể xóa pipeline đang có lead hoặc lịch sử chuyển giai đoạn.";
  if (reason === "stage_in_use") return "Không thể xóa stage đang có lead hoặc lịch sử chuyển giai đoạn.";
  if (reason === "stage_not_found") return "Không tìm thấy stage trong pipeline đã chọn.";
  return "Không tìm thấy pipeline.";
}

pipelinesRouter.get("/", async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách pipeline không hợp lệ." });
      return;
    }
    response.json(await listManagedPipelines(parsed.data));
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.get("/options", async (_request, response, next) => {
  try {
    response.json(await getPipelineManagementOptions());
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.post("/", async (request, response, next) => {
  try {
    const parsed = pipelineBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo pipeline không hợp lệ." });
      return;
    }
    const result = await createManagedPipeline(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.patch("/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = pipelineBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật pipeline không hợp lệ." });
      return;
    }
    const result = await updateManagedPipeline(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.delete("/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã pipeline không hợp lệ." });
      return;
    }
    const result = await deleteManagedPipeline(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "pipeline_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.post("/:id/stages", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = stageBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu tạo stage không hợp lệ." });
      return;
    }
    const result = await createManagedPipelineStage(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.patch("/:id/stages/:stageId", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedStageId = idSchema.safeParse(request.params.stageId);
    const parsedBody = stageBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedStageId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật stage không hợp lệ." });
      return;
    }
    const result = await updateManagedPipelineStage(request.authUser!, parsedId.data, parsedStageId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

pipelinesRouter.delete("/:id/stages/:stageId", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedStageId = idSchema.safeParse(request.params.stageId);
    if (!parsedId.success || !parsedStageId.success) {
      response.status(400).json({ message: "Mã stage không hợp lệ." });
      return;
    }
    const result = await deleteManagedPipelineStage(request.authUser!, parsedId.data, parsedStageId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "stage_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
