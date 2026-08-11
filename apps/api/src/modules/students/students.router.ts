import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  createStudentServiceRequest,
  getStudentServiceOptions,
  listStudentServices,
  listStudentSupportHistory,
  studentServiceStatuses,
  updateStudentServiceRequest,
  type StudentServiceInput,
  type StudentServiceUpdateInput,
} from "./student-business.service";
import {
  getStudentDetail,
  getStudentFilterOptions,
  listStudents,
  updateStudentAcademicInfo,
} from "./student-list.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  majorId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  facultyId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  classId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["enrolledAt", "studentCode", "status"]).default("enrolledAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const serviceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  type: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  studentId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "type", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const serviceBodySchema = z.object({
  studentId: z.uuid(),
  type: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1).max(2000),
  handledBy: z.union([z.uuid(), z.literal("")]).optional().transform((value) => value || undefined),
  status: z.enum(studentServiceStatuses).optional(),
}) satisfies z.ZodType<StudentServiceInput>;

const serviceUpdateBodySchema = z.object({
  type: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  handledBy: z.union([z.uuid(), z.literal("")]).optional().transform((value) => (value === undefined ? undefined : value || null)),
  status: z.enum(studentServiceStatuses).optional(),
}) satisfies z.ZodType<StudentServiceUpdateInput>;

const studentUpdateSchema = z.object({
  status: z.string().trim().min(1).max(50),
  facultyId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  classId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});

export const studentsRouter = Router();

studentsRouter.get(
  "/",
  requireAuthentication,
  requireAnyPermission("student.view_all", "student.view"),
  async (request, response, next) => {
    try {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách sinh viên không hợp lệ." });
        return;
      }

      response.json(await listStudents(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.get(
  "/options",
  requireAuthentication,
  requireAnyPermission("student.view_all", "student.view"),
  async (request, response, next) => {
    try {
      response.json(await getStudentFilterOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.get(
  "/services",
  requireAuthentication,
  requireAnyPermission("student_service.view", "student.view_all"),
  async (request, response, next) => {
    try {
      const parsed = serviceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách dịch vụ sinh viên không hợp lệ." });
        return;
      }

      response.json(await listStudentServices(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request),
      }));
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.post(
  "/services",
  requireAuthentication,
  requireAnyPermission("student_service.create"),
  async (request, response, next) => {
    try {
      const parsed = serviceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin yêu cầu dịch vụ không hợp lệ." });
        return;
      }

      const result = await createStudentServiceRequest(
        request.authUser!,
        parsed.data,
        request.ip,
        getInstitutionProgramScope(request),
      );
      if (!result.ok) {
        response.status(400).json({ message: studentServiceActionMessage(result.reason) });
        return;
      }

      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.get(
  "/services/options",
  requireAuthentication,
  requireAnyPermission("student_service.view", "student_service.create", "student_service.update", "student.view_all"),
  async (request, response, next) => {
    try {
      response.json(await getStudentServiceOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.patch(
  "/services/:serviceId",
  requireAuthentication,
  requireAnyPermission("student_service.update"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.serviceId);
      const body = serviceUpdateBodySchema.safeParse(request.body);
      if (!id.success || !body.success) {
        response.status(400).json({ message: "Thông tin cập nhật dịch vụ không hợp lệ." });
        return;
      }

      const result = await updateStudentServiceRequest(
        request.authUser!,
        id.data,
        body.data,
        request.ip,
        getInstitutionProgramScope(request),
      );
      if (!result.ok) {
        response.status(result.reason === "service_not_found" ? 404 : 400).json({ message: studentServiceActionMessage(result.reason) });
        return;
      }

      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.get(
  "/support-history",
  requireAuthentication,
  requireAnyPermission("student_service.view", "student.view_all"),
  async (request, response, next) => {
    try {
      const parsed = serviceQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số lịch sử hỗ trợ không hợp lệ." });
        return;
      }

      response.json(await listStudentSupportHistory(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request),
      }));
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.get(
  "/:id",
  requireAuthentication,
  requireAnyPermission("student.view_all", "student.view"),
  async (request, response, next) => {
    try {
      const parsed = z.uuid().safeParse(request.params.id);
      if (!parsed.success) {
        response.status(400).json({ message: "Mã sinh viên không hợp lệ." });
        return;
      }

      const student = await getStudentDetail(request.authUser!, parsed.data, getInstitutionProgramScope(request));
      if (!student) {
        response.status(404).json({ message: "Không tìm thấy sinh viên trong phạm vi truy cập." });
        return;
      }

      response.json(student);
    } catch (error) {
      next(error);
    }
  },
);

studentsRouter.patch(
  "/:id",
  requireAuthentication,
  requireAnyPermission("student.update_all", "student.update"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      const body = studentUpdateSchema.safeParse(request.body);
      if (!id.success || !body.success) {
        response.status(400).json({ message: "Thông tin cập nhật sinh viên không hợp lệ." });
        return;
      }

      const result = await updateStudentAcademicInfo(
        request.authUser!,
        id.data,
        body.data,
        request.ip,
        getInstitutionProgramScope(request),
      );
      if (!result.ok) {
        response.status(result.reason === "student_not_found" ? 404 : 400).json({ message: studentActionMessage(result.reason) });
        return;
      }

      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

function studentActionMessage(reason: string) {
  const messages: Record<string, string> = {
    class_faculty_mismatch: "Lớp sinh viên không thuộc khoa đã chọn.",
    class_not_found: "Lớp sinh viên không hợp lệ.",
    faculty_not_found: "Khoa không hợp lệ.",
    student_not_found: "Không tìm thấy sinh viên trong phạm vi truy cập.",
  };
  return messages[reason] ?? "Không thể cập nhật sinh viên.";
}

function studentServiceActionMessage(reason: string) {
  const messages: Record<string, string> = {
    handler_not_found: "Người xử lý không hợp lệ.",
    service_not_found: "Không tìm thấy yêu cầu dịch vụ trong phạm vi truy cập.",
    student_not_found: "Không tìm thấy sinh viên trong phạm vi truy cập.",
  };
  return messages[reason] ?? "Không thể xử lý yêu cầu dịch vụ sinh viên.";
}
