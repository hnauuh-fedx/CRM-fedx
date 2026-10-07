import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../database/prisma";
import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createInstitutionProgram,
  deleteInstitutionProgram,
  listManagedInstitutionPrograms,
  updateInstitutionProgram,
} from "./institution-program-management.service";

export const institutionProgramsRouter = Router();

export const institutionProgramQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["active", "inactive", "archived"]).optional().or(z.literal("")).transform((value) => value || undefined),
  institutionName: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "code", "status"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
const idSchema = z.uuid();
export const institutionProgramBodySchema = z.object({
  institutionName: z.string().trim().min(2).max(255),
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(100),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
});

function resultMessage(reason: string) {
  if (reason === "code_exists") return "Mã chương trình đã tồn tại.";
  if (reason === "name_exists") return "Tên chương trình đã tồn tại trong cùng trường.";
  if (reason === "program_in_use") return "Không thể xóa chương trình đang có dữ liệu tuyển sinh liên quan.";
  return "Không tìm thấy chương trình tuyển sinh.";
}

institutionProgramsRouter.get("/options", requireAuthentication, async (request, response, next) => {
  try {
    const programs = await prisma.institution_programs.findMany({
      where: {
        id: { in: request.authUser!.institutionProgramIds },
        status: "active",
      },
      select: {
        id: true,
        name: true,
        code: true,
        institution_name: true,
      },
      orderBy: [{ institution_name: "asc" }, { name: "asc" }],
    });

    response.json({
      data: programs.map((program) => ({
        id: program.id,
        name: program.name,
        code: program.code,
        institutionName: program.institution_name,
      })),
    });
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.use(requireAuthentication, requireAnyPermission("institution_program.manage"));

institutionProgramsRouter.get("/", async (request, response, next) => {
  try {
    const parsed = institutionProgramQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách chương trình không hợp lệ." });
      return;
    }
    response.json(await listManagedInstitutionPrograms(parsed.data));
  } catch (error) {
    next(error);
  }
});

institutionProgramsRouter.post("/", async (request, response, next) => {
  try {
    const parsed = institutionProgramBodySchema.safeParse(request.body);
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
    const parsedBody = institutionProgramBodySchema.safeParse(request.body);
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
