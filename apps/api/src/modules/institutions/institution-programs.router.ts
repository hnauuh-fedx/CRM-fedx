import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../database/prisma";
import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createInstitutionProgram,
  deleteInstitutionProgram,
  getInstitutionProgramManagementOptions,
  listManagedInstitutionPrograms,
  updateInstitutionProgram,
} from "./institution-program-management.service";

export const institutionProgramsRouter = Router();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["active", "inactive", "archived"]).optional().or(z.literal("")).transform((value) => value || undefined),
  institutionId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  programTypeId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "code", "status"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
const idSchema = z.uuid();
const bodySchema = z.object({
  institutionId: z.uuid(),
  programTypeId: z.uuid(),
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(100),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
});

function resultMessage(reason: string) {
  if (reason === "institution_not_found") return "Trường/đơn vị đã chọn không tồn tại.";
  if (reason === "program_type_not_found") return "Loại chương trình đã chọn không tồn tại.";
  if (reason === "code_exists") return "Mã chương trình đã tồn tại.";
  if (reason === "name_exists") return "Tên chương trình đã tồn tại trong cùng trường và loại chương trình.";
  if (reason === "program_in_use") return "Không thể xóa chương trình đang có dữ liệu tuyển sinh liên quan.";
  return "Không tìm thấy chương trình tuyển sinh.";
}

institutionProgramsRouter.get("/options", requireAuthentication, async (request, response, next) => {
  try {
    const programs = await prisma.institution_programs.findMany({
      where: {
        id: { in: request.authUser!.institutionProgramIds },
        status: "active",
        institutions: { is: { status: "active" } },
      },
      select: {
        id: true,
        name: true,
        code: true,
        institutions: { select: { name: true } },
        program_types: { select: { name: true } },
      },
      orderBy: [{ institutions: { name: "asc" } }, { name: "asc" }],
    });

    response.json({
      data: programs.map((program) => ({
        id: program.id,
        name: program.name,
        code: program.code,
        institutionName: program.institutions.name,
        programTypeName: program.program_types.name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.use(requireAuthentication, requireAnyPermission("institution_program.manage"));

institutionProgramsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách chương trình không hợp lệ." });
      return;
    }
    response.json(await listManagedInstitutionPrograms(parsed.data));
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.get("/management-options", async (_request, response, next) => {
  try {
    response.json(await getInstitutionProgramManagementOptions());
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.post("/", async (request, response, next) => {
  try {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo chương trình không hợp lệ." });
      return;
    }
    const result = await createInstitutionProgram(request.authUser!, parsed.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "code_exists" || result.reason === "name_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.patch("/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật chương trình không hợp lệ." });
      return;
    }
    const result = await updateInstitutionProgram(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "program_not_found" ? 404 : result.reason === "code_exists" || result.reason === "name_exists" ? 409 : 400).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.delete("/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã chương trình không hợp lệ." });
      return;
    }
    const result = await deleteInstitutionProgram(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "program_not_found" ? 404 : 409).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
