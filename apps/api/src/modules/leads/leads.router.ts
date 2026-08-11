import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  getLeadDetail,
  getLeadFilterOptions,
  leadListPermissions,
  listLeads,
} from "./lead-list.service";
import {
  addLeadNote,
  assignLead,
  attachLeadFile,
  changeLeadStage,
  createLead,
  deleteLead,
  getLeadActionOptions,
  leadUpdatePermissions,
  updateLead,
} from "./lead-management.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { importLeadsFromWorkbook } from "./lead-import.service";
import { getLeadCustomFieldDefinitions, getLeadCustomFields, patchLeadCustomFields } from "./lead-custom-fields.service";

const leadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  pipelineStageId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sourceId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  assigneeId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "fullName", "leadCode", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const leadIdSchema = z.uuid();
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);
const optionalDate = z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined);
const optionalNumber = (max: number) =>
  z.string().trim().regex(/^\d+$/, "Giá trị phải là số nguyên.").refine((value) => Number(value) <= max).optional()
    .or(z.literal("")).transform((value) => value || undefined);
const optionalDecimal = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Điểm hoặc số tiền không hợp lệ.")
  .optional().or(z.literal("")).transform((value) => value || undefined);
const requiredPhone = z.string().trim().regex(/^\d{10}$/, "Số điện thoại phải gồm đúng 10 chữ số.");
const optionalPhone = z.string().trim().regex(/^\d{10}$/, "Số điện thoại phải gồm đúng 10 chữ số.")
  .optional().or(z.literal("")).transform((value) => value || undefined);
const leadBodySchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  phone: requiredPhone,
  sourceId: z.uuid(),
  pipelineStageId: z.uuid().optional().or(z.literal("")),
  email: z.email().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  gender: optionalText(20),
  dateOfBirth: optionalDate,
  cccd: optionalText(30),
  note: optionalText(2000),
  status: optionalText(50),
  temperature: optionalText(50),
  birthPlace: optionalText(255),
  cccdIssueDate: optionalDate,
  cccdIssuePlace: optionalText(255),
  nationality: optionalText(100),
  ethnicity: optionalText(100),
  religion: optionalText(100),
  graduationYear: optionalNumber(2100),
  graduationCertificate: optionalText(255),
  previousGraduationCertificate: optionalText(255),
  graduationMajor: optionalText(255),
  graduationRank: optionalText(100),
  diplomaIssuePlace: optionalText(255),
  academicRank12: optionalText(100),
  conductRank12: optionalText(100),
  highSchoolName: optionalText(255),
  highSchoolProvince: optionalText(150),
  highSchoolDistrict: optionalText(150),
  currentJob: optionalText(255),
  companyName: optionalText(255),
  specificAddress: optionalText(1000),
  permanentAddress: optionalText(1000),
  currentAddress: optionalText(1000),
  currentResidence: optionalText(1000),
  province: optionalText(150),
  district: optionalText(150),
  ward: optionalText(150),
  hamlet: optionalText(150),
  relative1FullName: optionalText(255),
  relative1Relationship: optionalText(100),
  relative1Phone: optionalPhone,
  relative1Job: optionalText(255),
  relative1Address: optionalText(1000),
  relative2FullName: optionalText(255),
  relative2Relationship: optionalText(100),
  relative2Phone: optionalPhone,
  relative2Job: optionalText(255),
  relative2Address: optionalText(1000),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  majorId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  admissionStatusId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  trainingCode: optionalText(100),
  classCode: optionalText(100),
  subjectGroupCode: optionalText(100),
  subjectGroupName: optionalText(255),
  score1: optionalDecimal,
  score2: optionalDecimal,
  score3: optionalDecimal,
  admissionScore: optionalDecimal,
  enrollmentBatch: optionalText(150),
  registrationStation: optionalText(150),
  decisionNumber: optionalText(150),
  decisionSignedDate: optionalDate,
  monthlyRevenue: optionalDecimal,
  gclid: optionalText(1000),
  tags: z.string().trim().max(1000).optional(),
}).superRefine((input, context) => {
  const hasAdmissionInformation = [
    input.majorId, input.admissionStatusId, input.trainingCode, input.classCode, input.subjectGroupCode,
    input.subjectGroupName, input.score1, input.score2, input.score3, input.admissionScore,
    input.enrollmentBatch, input.registrationStation, input.decisionNumber, input.decisionSignedDate,
    input.monthlyRevenue,
  ].some(Boolean);
  if (hasAdmissionInformation && !input.institutionProgramId) {
    context.addIssue({ code: "custom", path: ["institutionProgramId"], message: "Vui lòng chọn chương trình tuyển sinh." });
  }
  if (hasAdmissionInformation && !input.majorId) {
    context.addIssue({ code: "custom", path: ["majorId"], message: "Vui lòng chọn ngành đăng ký khi nhập thông tin tuyển sinh." });
  }
  if (hasAdmissionInformation && !input.admissionStatusId) {
    context.addIssue({ code: "custom", path: ["admissionStatusId"], message: "Vui lòng chọn trạng thái hồ sơ tuyển sinh." });
  }
});
const stageBodySchema = z.object({ stageId: z.uuid() });
const noteBodySchema = z.object({ content: z.string().trim().min(1).max(4000) });
const fileBodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.url().max(2000),
  mimeType: optionalText(100),
  fileSize: z.number().int().positive().max(100 * 1024 * 1024).optional(),
});
const assignmentBodySchema = z.object({
  assigneeId: z.uuid(),
  departmentId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});
const customFieldValuesSchema = z.object({ values: z.array(z.object({ fieldId: z.uuid(), value: z.unknown().nullable() })).min(1).max(100) });

export const leadsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

leadsRouter.get(
  "/",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsed = leadListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách lead không hợp lệ." });
        return;
      }

      const result = await listLeads(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get(
  "/options",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      response.json(await getLeadFilterOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get(
  "/action-options",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      response.json(await getLeadActionOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/",
  requireAuthentication,
  requireAnyPermission("lead.create"),
  async (request, response, next) => {
    try {
      const institutionProgramId = getInstitutionProgramScope(request);
      const parsed = leadBodySchema.safeParse({
        ...request.body,
        ...(institutionProgramId ? { institutionProgramId } : {}),
      });
      if (!parsed.success) {
        response.status(400).json({ message: "Dữ liệu tạo lead không hợp lệ." });
        return;
      }
      const result = await createLead(request.authUser!, parsed.data);
      if (!result.ok) {
        response.status(result.reason === "phone_already_exists" ? 409 : 400).json({
          message: result.reason === "phone_already_exists"
            ? "Số điện thoại đã tồn tại trong danh sách lead."
            : result.reason === "source_not_found"
            ? "Nguồn lead không tồn tại."
            : result.reason === "stage_not_found"
              ? "Tiến trình đã chọn không tồn tại."
            : "Ngành đăng ký hoặc trạng thái hồ sơ không tồn tại.",
        });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get("/custom-fields", requireAuthentication, requireAnyPermission("lead.create", ...leadUpdatePermissions, "custom_field.view"), async (request, response, next) => { try { if (!request.authUser!.permissions.includes("custom_field.view")) return response.status(403).json({ message: "Bạn không có quyền xem trường dữ liệu tùy chỉnh." }); const parsed = z.object({ institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || null) }).safeParse(request.query); if (!parsed.success) return response.status(400).json({ message: "Chương trình tuyển sinh không hợp lệ." }); const canEdit = request.authUser!.permissions.includes("lead.create") || request.authUser!.permissions.some((permission) => leadUpdatePermissions.includes(permission as typeof leadUpdatePermissions[number])); response.json(await getLeadCustomFieldDefinitions(request.authUser!, parsed.data.institutionProgramId, canEdit)); } catch (error) { next(error); } });

leadsRouter.post(
  "/import",
  requireAuthentication,
  requireAnyPermission("lead.create"),
  upload.single("file"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ message: "Vui lòng chọn file Excel để import lead." });
        return;
      }
      const allowedMimeTypes = new Set([
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
      ]);
      const hasExcelExtension = /\.(xlsx|xls)$/i.test(request.file.originalname);
      if (!hasExcelExtension && !allowedMimeTypes.has(request.file.mimetype)) {
        response.status(400).json({ message: "File import phải là Excel .xlsx hoặc .xls." });
        return;
      }

      response.json(await importLeadsFromWorkbook(request.authUser!, request.file.buffer, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.patch(
  "/:id",
  requireAuthentication,
  requireAnyPermission(...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      const institutionProgramId = getInstitutionProgramScope(request);
      const parsedBody = leadBodySchema.safeParse({
        ...request.body,
        ...(institutionProgramId ? { institutionProgramId } : {}),
      });
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu cập nhật lead không hợp lệ." });
        return;
      }
      const result = await updateLead(request.authUser!, parsedId.data, parsedBody.data, institutionProgramId);
      if (!result.ok && result.reason === "lead_not_found") {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      if (!result.ok) {
        response.status(result.reason === "phone_already_exists" ? 409 : 400).json({
          message: result.reason === "phone_already_exists"
            ? "Số điện thoại đã tồn tại trong danh sách lead."
            : result.reason === "source_not_found"
            ? "Nguồn lead không tồn tại."
            : result.reason === "stage_not_found"
              ? "Tiến trình đã chọn không tồn tại."
            : "Ngành đăng ký hoặc trạng thái hồ sơ không tồn tại.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.patch(
  "/:id/stage",
  requireAuthentication,
  requireAnyPermission(...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      const parsedBody = stageBodySchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu chuyển giai đoạn không hợp lệ." });
        return;
      }
      const result = await changeLeadStage(request.authUser!, parsedId.data, parsedBody.data.stageId, getInstitutionProgramScope(request));
      if (!result.ok) {
        response.status(404).json({
          message: result.reason === "lead_not_found"
            ? "Không tìm thấy lead trong phạm vi truy cập."
            : "Không tìm thấy giai đoạn pipeline.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.delete(
  "/:id",
  requireAuthentication,
  requireAnyPermission("lead.delete"),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã lead không hợp lệ." });
        return;
      }
      const result = await deleteLead(request.authUser!, parsedId.data, getInstitutionProgramScope(request));
      if (!result.ok) {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/:id/notes",
  requireAuthentication,
  requireAnyPermission("lead_note.create", ...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      const parsedBody = noteBodySchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Nội dung ghi chú không hợp lệ." });
        return;
      }
      const result = await addLeadNote(request.authUser!, parsedId.data, parsedBody.data.content, getInstitutionProgramScope(request));
      if (!result.ok) {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/:id/files",
  requireAuthentication,
  requireAnyPermission("file.upload", ...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      const parsedBody = fileBodySchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Thông tin tệp đính kèm không hợp lệ." });
        return;
      }
      const result = await attachLeadFile(request.authUser!, parsedId.data, parsedBody.data, getInstitutionProgramScope(request));
      if (!result.ok) {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/:id/assign",
  requireAuthentication,
  requireAnyPermission("lead.assign", "lead.reassign"),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      const parsedBody = assignmentBodySchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Thông tin phân công không hợp lệ." });
        return;
      }
      const result = await assignLead(request.authUser!, parsedId.data, parsedBody.data, getInstitutionProgramScope(request));
      if (!result.ok) {
        response.status(result.reason === "lead_not_found" ? 404 : 400).json({
          message: result.reason === "lead_not_found"
            ? "Không tìm thấy lead trong phạm vi truy cập."
            : "Nhân viên phân công không hợp lệ với phòng ban.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get("/:id/custom-fields", requireAuthentication, requireAnyPermission(...leadListPermissions, "custom_field.view"), async (request, response, next) => { try { const parsed = leadIdSchema.safeParse(request.params.id); if (!parsed.success) return response.status(400).json({ message: "Mã lead không hợp lệ." }); if (!request.authUser!.permissions.includes("custom_field.view")) return response.status(403).json({ message: "Bạn không có quyền xem trường dữ liệu tùy chỉnh." }); const data = await getLeadCustomFields(request.authUser!, parsed.data); if (!data) return response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." }); response.json(data); } catch (error) { next(error); } });
leadsRouter.patch("/:id/custom-fields", requireAuthentication, requireAnyPermission(...leadUpdatePermissions), async (request, response, next) => { try { const parsedId = leadIdSchema.safeParse(request.params.id), parsedBody = customFieldValuesSchema.safeParse(request.body); if (!parsedId.success || !parsedBody.success) return response.status(400).json({ message: "Giá trị trường dữ liệu không hợp lệ." }); const result = await patchLeadCustomFields(request.authUser!, parsedId.data, parsedBody.data.values, request.ip); if (!result.ok) return response.status(result.reason === "not_found" ? 404 : result.reason === "forbidden" || result.reason === "sensitive_forbidden" ? 403 : 400).json({ message: result.reason === "sensitive_forbidden" ? "Bạn không có quyền sửa trường dữ liệu nhạy cảm." : "Không thể lưu trường dữ liệu tùy chỉnh." }); response.json({ message: "Đã lưu trường dữ liệu tùy chỉnh." }); } catch (error) { next(error); } });

leadsRouter.get(
  "/:id",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã lead không hợp lệ." });
        return;
      }

      const lead = await getLeadDetail(request.authUser!, parsedId.data, getInstitutionProgramScope(request));
      if (!lead) {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }

      response.json({ data: lead });
    } catch (error) {
      next(error);
    }
  },
);
