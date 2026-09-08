import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createRole,
  deleteRole,
  getRoleManagementOptions,
  listAccessScopes,
  listRoles,
  updateAccessScope,
  updateRole,
} from "./role-management.service";

const roleIdSchema = z.uuid();
const scopeCodeSchema = z.enum(["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"]);
const roleBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().or(z.literal("")).transform((value) => value || undefined),
  scopeCode: scopeCodeSchema,
  permissionIds: z.array(z.uuid()).default([]),
  programIds: z.array(z.uuid()).min(1),
});
const scopeBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(1000).optional().or(z.literal("")).transform((value) => value || undefined),
  isActive: z.boolean().default(true),
});

export const rolesRouter = Router();

rolesRouter.use(requireAuthentication, requireAnyPermission("role.manage"));

function resultMessage(reason: string) {
  if (reason === "code_exists") return "Mã vai trò đã tồn tại.";
  if (reason === "permission_not_found") return "Có quyền chức năng đã chọn không tồn tại.";
  if (reason === "program_required") return "Vai trò phải được gán ít nhất một chương trình.";
  if (reason === "program_not_found") return "Có chương trình đã chọn không tồn tại hoặc không còn hoạt động.";
  if (reason === "scope_not_supported") return "Scope truy cập không được hỗ trợ.";
  if (reason === "scope_inactive") return "Scope truy cập đang tắt, không thể gán cho vai trò.";
  if (reason === "role_in_use") return "Không thể xóa vai trò đang được gán cho người dùng.";
  return "Không tìm thấy vai trò hoặc scope cần cập nhật.";
}

rolesRouter.get("/", async (_request, response, next) => {
  try {
    response.json(await listRoles());
  } catch (error) {
    next(error);
  }
});

rolesRouter.get("/options", async (_request, response, next) => {
  try {
    response.json(await getRoleManagementOptions());
  } catch (error) {
    next(error);
  }
});

rolesRouter.get("/scopes", async (_request, response, next) => {
  try {
    response.json(await listAccessScopes());
  } catch (error) {
    next(error);
  }
});

rolesRouter.post("/", async (request, response, next) => {
  try {
    const parsed = roleBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo vai trò không hợp lệ." });
      return;
    }
    const result = await createRole(request.authUser!, parsed.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "code_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

rolesRouter.patch("/:id", async (request, response, next) => {
  try {
    const parsedId = roleIdSchema.safeParse(request.params.id);
    const parsedBody = roleBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật vai trò không hợp lệ." });
      return;
    }
    const result = await updateRole(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "role_not_found" ? 404 : result.reason === "code_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

rolesRouter.delete("/:id", async (request, response, next) => {
  try {
    const parsedId = roleIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã vai trò không hợp lệ." });
      return;
    }
    const result = await deleteRole(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "role_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

rolesRouter.patch("/scopes/:code", async (request, response, next) => {
  try {
    const parsedCode = scopeCodeSchema.safeParse(request.params.code);
    const parsedBody = scopeBodySchema.safeParse(request.body);
    if (!parsedCode.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật scope không hợp lệ." });
      return;
    }
    const result = await updateAccessScope(request.authUser!, parsedCode.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
