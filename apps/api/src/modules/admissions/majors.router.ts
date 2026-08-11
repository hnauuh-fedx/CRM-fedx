import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import {
  createProgramMajor,
  deleteProgramMajor,
  getMajorManagementOptions,
  listProgramMajors,
  updateProgramMajor,
} from "./major-management.service";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "code"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const majorIdSchema = z.uuid();
const bodySchema = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(100),
  facultyId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});

export const majorsRouter = Router();

majorsRouter.use(requireAuthentication, requireAnyPermission("admission_major.manage"));

function requireSelectedProgram(request: Request, response: Response) {
  const institutionProgramId = getInstitutionProgramScope(request);
  if (!institutionProgramId) {
    response.status(400).json({ message: "Vui lòng chọn chương trình đang làm việc trước khi quản lý ngành." });
    return null;
  }
  return institutionProgramId;
}

majorsRouter.get("/", async (request, response, next) => {
  try {
    const institutionProgramId = requireSelectedProgram(request, response);
    if (!institutionProgramId) {
      return;
    }
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách ngành không hợp lệ." });
      return;
    }
    response.json(await listProgramMajors(institutionProgramId, parsed.data));
  } catch (error) {
    next(error);
  }
});

majorsRouter.get("/options", async (_request, response, next) => {
  try {
    response.json(await getMajorManagementOptions());
  } catch (error) {
    next(error);
  }
});

majorsRouter.post("/", async (request, response, next) => {
  try {
    const institutionProgramId = requireSelectedProgram(request, response);
    if (!institutionProgramId) {
      return;
    }
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo ngành không hợp lệ." });
      return;
    }
    const result = await createProgramMajor(request.authUser!.id, institutionProgramId, parsed.data);
    if (!result.ok) {
      response.status(result.reason === "code_already_exists" ? 409 : 400).json({
        message: result.reason === "code_already_exists"
          ? "Mã ngành đã tồn tại trong chương trình này."
          : result.reason === "faculty_not_found"
            ? "Khoa đã chọn không tồn tại."
            : "Chương trình đang chọn không tồn tại.",
      });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

majorsRouter.patch("/:id", async (request, response, next) => {
  try {
    const institutionProgramId = requireSelectedProgram(request, response);
    if (!institutionProgramId) {
      return;
    }
    const parsedId = majorIdSchema.safeParse(request.params.id);
    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật ngành không hợp lệ." });
      return;
    }
    const result = await updateProgramMajor(request.authUser!.id, institutionProgramId, parsedId.data, parsedBody.data);
    if (!result.ok) {
      response.status(result.reason === "major_not_found" ? 404 : result.reason === "code_already_exists" ? 409 : 400).json({
        message: result.reason === "major_not_found"
          ? "Không tìm thấy ngành trong chương trình đang chọn."
          : result.reason === "code_already_exists"
            ? "Mã ngành đã tồn tại trong chương trình này."
            : "Khoa đã chọn không tồn tại.",
      });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

majorsRouter.delete("/:id", async (request, response, next) => {
  try {
    const institutionProgramId = requireSelectedProgram(request, response);
    if (!institutionProgramId) {
      return;
    }
    const parsedId = majorIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã ngành không hợp lệ." });
      return;
    }
    const result = await deleteProgramMajor(request.authUser!.id, institutionProgramId, parsedId.data);
    if (!result.ok) {
      response.status(result.reason === "major_not_found" ? 404 : 409).json({
        message: result.reason === "major_not_found"
          ? "Không tìm thấy ngành trong chương trình đang chọn."
          : "Không thể xóa ngành đã được sử dụng cho lead, hồ sơ hoặc sinh viên.",
      });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
