import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createPermission,
  deletePermission,
  getPermissionManagementOptions,
  listPermissions,
  updatePermission,
} from "./permission-management.service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  module: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["active", "inactive"]).optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "code", "name", "module"]).default("code"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const permissionIdSchema = z.uuid();
const permissionBodySchema = z.object({
  code: z.string().trim().min(2).max(150),
  name: z.string().trim().min(2).max(150),
  module: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  description: z.string().trim().max(1000).optional().or(z.literal("")).transform((value) => value || undefined),
  isActive: z.boolean().default(true),
});

export const permissionsRouter = Router();

permissionsRouter.use(requireAuthentication, requireAnyPermission("permission.manage"));

function resultMessage(reason: string) {
  if (reason === "code_exists") return "Mã quyền đã tồn tại.";
  if (reason === "permission_in_use") return "Không thể xóa quyền đang được gán cho vai trò.";
  return "Không tìm thấy quyền chức năng.";
}

permissionsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách quyền không hợp lệ." });
      return;
    }
    response.json(await listPermissions(parsed.data));
  } catch (error) {
    next(error);
  }
});

permissionsRouter.get("/options", async (_request, response, next) => {
  try {
    response.json(await getPermissionManagementOptions());
  } catch (error) {
    next(error);
  }
});

permissionsRouter.post("/", async (request, response, next) => {
  try {
    const parsed = permissionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo quyền không hợp lệ." });
      return;
    }
    const result = await createPermission(request.authUser!, parsed.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "code_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

permissionsRouter.patch("/:id", async (request, response, next) => {
  try {
    const parsedId = permissionIdSchema.safeParse(request.params.id);
    const parsedBody = permissionBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật quyền không hợp lệ." });
      return;
    }
    const result = await updatePermission(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "permission_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

permissionsRouter.delete("/:id", async (request, response, next) => {
  try {
    const parsedId = permissionIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã quyền không hợp lệ." });
      return;
    }
    const result = await deletePermission(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "permission_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
