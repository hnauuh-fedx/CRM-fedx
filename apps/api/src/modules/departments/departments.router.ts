import { Router } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createManagedDepartment,
  deleteManagedDepartment,
  getDepartmentManagementOptions,
  listManagedDepartments,
  updateManagedDepartment,
} from "./department-management.service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "code", "name"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const departmentIdSchema = z.uuid();
const departmentBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  managerId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  memberIds: z.array(z.uuid()).default([]),
});

export const departmentsRouter = Router();

departmentsRouter.use(requireAuthentication, requireAnyPermission("department.manage"));

function resultMessage(reason: string) {
  if (reason === "code_exists") return "Mã phòng ban đã tồn tại.";
  if (reason === "user_not_found") return "Người dùng đã chọn không tồn tại hoặc không còn hoạt động.";
  if (reason === "department_in_use") return "Không thể xóa phòng ban đang có thành viên hoặc dữ liệu phân công lead.";
  return "Không tìm thấy phòng ban.";
}

departmentsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách phòng ban không hợp lệ." });
      return;
    }
    response.json(await listManagedDepartments(parsed.data));
  } catch (error) {
    next(error);
  }
});

departmentsRouter.get("/options", async (_request, response, next) => {
  try {
    response.json(await getDepartmentManagementOptions());
  } catch (error) {
    next(error);
  }
});

departmentsRouter.post("/", async (request, response, next) => {
  try {
    const parsed = departmentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo phòng ban không hợp lệ." });
      return;
    }
    const result = await createManagedDepartment(request.authUser!, parsed.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "code_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

departmentsRouter.patch("/:id", async (request, response, next) => {
  try {
    const parsedId = departmentIdSchema.safeParse(request.params.id);
    const parsedBody = departmentBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật phòng ban không hợp lệ." });
      return;
    }
    const result = await updateManagedDepartment(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "department_not_found" ? 404 : result.reason === "code_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

departmentsRouter.delete("/:id", async (request, response, next) => {
  try {
    const parsedId = departmentIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã phòng ban không hợp lệ." });
      return;
    }
    const result = await deleteManagedDepartment(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "department_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
