import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createManagedUser,
  getUserManagementOptions,
  listManagedUsers,
  updateManagedUser,
} from "./user-management.service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.enum(["active", "inactive", "suspended"]).optional().or(z.literal("")).transform((value) => value || undefined),
  roleId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  departmentId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "fullName", "email", "lastLoginAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const userIdSchema = z.uuid();
const userBodySchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.email().trim().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
  password: z.string().min(8).max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  roleIds: z.array(z.uuid()).default([]),
  departmentIds: z.array(z.uuid()).default([]),
  accessScope: z.enum(["ALL", "DEPARTMENT", "ASSIGNED_ONLY", "OWNED_ONLY", "READ_ONLY"]).default("DEPARTMENT"),
});

export const usersRouter = Router();

usersRouter.use(requireAuthentication, requireAnyPermission("user.manage"));

function resultMessage(reason: string) {
  if (reason === "email_exists") return "Email đã được sử dụng cho tài khoản khác.";
  if (reason === "role_not_found") return "Vai trò đã chọn không tồn tại.";
  if (reason === "department_not_found") return "Phòng ban đã chọn không tồn tại.";
  if (reason === "password_required") return "Vui lòng nhập mật khẩu ban đầu tối thiểu 8 ký tự.";
  return "Không tìm thấy tài khoản người dùng.";
}

usersRouter.get("/", async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách người dùng không hợp lệ." });
      return;
    }
    response.json(await listManagedUsers(parsed.data));
  } catch (error) {
    next(error);
  }
});

usersRouter.get("/options", async (_request, response, next) => {
  try {
    response.json(await getUserManagementOptions());
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/", async (request, response, next) => {
  try {
    const parsed = userBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo người dùng không hợp lệ." });
      return;
    }
    const result = await createManagedUser(request.authUser!, parsed.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "email_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch("/:id", async (request, response, next) => {
  try {
    const parsedId = userIdSchema.safeParse(request.params.id);
    const parsedBody = userBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật người dùng không hợp lệ." });
      return;
    }
    const result = await updateManagedUser(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "user_not_found" ? 404 : result.reason === "email_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
