import { prisma } from "../../database/prisma";
import { changeStudentMembership } from "../students/student-conversion.service";
import { enrolledStudentWhere } from "../students/student-membership";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import * as XLSX from "xlsx";
import { getPreference } from "../system/system-preferences.service";
import { LEAD_PHONE_MAX_LENGTH } from "@admission-crm/shared/lead-phone";

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
import { filterConditionsParamSchema, LeadFilterError } from "./lead-filter.service";
import {
  addLeadNote,
  assignLead,
  assignLeads,
  attachLeadFile,
  changeLeadStatus,
  changeLeadStage,
  createLead,
  deleteLead,
  deleteLeads,
  getLeadActionOptions,
  leadUpdatePermissions,
  updateLead,
} from "./lead-management.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { importLeadsFromWorkbook, InvalidLeadImportFileError } from "./lead-import.service";
import { getLeadCustomFieldDefinitions, getLeadCustomFields, patchLeadCustomFields } from "./lead-custom-fields.service";
import { canCheckSensitiveDuplicates, listDuplicateGroupMembers, listDuplicateLeads } from "./lead-duplicates.service";
import { getSystemFieldRequirements } from "../custom-fields/system-field-requirements.service";
import { getVisibleTransitionNoteOptions } from "./transition-note.service";
import { transitionNoteTargetSchema } from "./transition-note.schema";
import { initializeLeadOnOpen } from "./application/open-lead.use-case";
import { bulkUpdateLeads, getBulkUpdateFieldOptions } from "./application/bulk-update-leads.use-case";

const leadListQuerySchema = z.object({
  audience: z.enum(["candidates", "students", "all"]).default("candidates"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  pipelineStageId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  status: z.enum(["ACTIVE", "FAIL"]).optional().or(z.literal("")).transform((value) => value || undefined),
  sourceId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  majorId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  assigneeId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  fromDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  toDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  filters: filterConditionsParamSchema,
  sortBy: z.enum(["createdAt", "fullName", "leadCode", "pipelineStage"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine((input) => !input.fromDate || !input.toDate || input.fromDate <= input.toDate, {
  message: "Khoảng ngày tạo không hợp lệ.",
});
const leadIdSchema = z.uuid();
const duplicateQuerySchema = z.object({
  field: z.enum(["fullName", "phone", "email"]),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const duplicateMembersQuerySchema = duplicateQuerySchema.extend({ key: z.string().trim().min(1).max(255) });
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);
const optionalDate = z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined);
const optionalNumber = (max: number) =>
  z.string().trim().regex(/^\d+$/, "Giá trị phải là số nguyên.").refine((value) => Number(value) <= max).optional()
    .or(z.literal("")).transform((value) => value || undefined);
const optionalDecimal = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Điểm hoặc số tiền không hợp lệ.")
  .optional().or(z.literal("")).transform((value) => value || undefined);
// Imported numbers may be non-standard; they are kept and highlighted in the UI instead of rejected.
const requiredPhone = z.string().trim().min(1, "Vui lòng nhập số điện thoại.")
  .max(LEAD_PHONE_MAX_LENGTH, `Số điện thoại tối đa ${LEAD_PHONE_MAX_LENGTH} ký tự.`);
const secondaryPhones = z.array(z.string().trim().max(LEAD_PHONE_MAX_LENGTH, `Số điện thoại tối đa ${LEAD_PHONE_MAX_LENGTH} ký tự.`))
  .max(5, "Mỗi lead có tối đa 5 số điện thoại phụ.").optional();
const optionalPhone = z.string().trim().regex(/^\d{10}$/, "Số điện thoại phải gồm đúng 10 chữ số.")
  .optional().or(z.literal("")).transform((value) => value || undefined);
const leadBodySchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  phone: requiredPhone,
  secondaryPhones,
  sourceId: z.uuid(),
  assigneeId: z.union([z.uuid(), z.literal(""), z.null()]).optional()
    .transform((value) => value === "" ? null : value),
  secondaryAssigneeId: z.union([z.uuid(), z.literal(""), z.null()]).optional()
    .transform((value) => value === "" ? null : value),
  pipelineStageId: z.uuid().optional().or(z.literal("")),
  noteTemplateId: z.uuid().optional(),
  noteContent: z.string().trim().min(1).max(1800).optional(),
  email: z.email().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  gender: optionalText(20),
  dateOfBirth: optionalDate,
  cccd: optionalText(30),
  note: optionalText(2000),
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
  monthlyRevenue: optionalDate,
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
});
const createLeadBodySchema = leadBodySchema.refine((input) => Boolean(input.institutionProgramId), {
  path: ["institutionProgramId"],
  message: "Vui lòng chọn chương trình tuyển sinh.",
});
const defaultLeadFieldRequirements: Record<string, boolean> = {
  fullName: true,
  phone: true,
  sourceId: true,
};
async function hasAllRequiredLeadFields(input: Record<string, unknown>) {
  const overrides = await getSystemFieldRequirements("LEAD");
  const requirements = { ...defaultLeadFieldRequirements, ...overrides };
  return Object.entries(requirements).every(([fieldKey, isRequired]) => {
    if (!isRequired || !(fieldKey in input)) return true;
    const value = input[fieldKey];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
  });
}
const stageBodySchema = z.object({ stageId: z.uuid(), noteTemplateId: z.uuid().optional(), noteContent: z.string().trim().min(1).max(1800).optional() });
const lifecycleStatusBodySchema = z.object({ status: z.enum(["ACTIVE", "FAIL"]), noteTemplateId: z.uuid().optional(), noteContent: z.string().trim().min(1).max(1800).optional() });
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
const bulkAssignmentBodySchema = z.object({
  leadIds: z.array(z.uuid()).min(1).max(100).transform((leadIds) => [...new Set(leadIds)]),
  assigneeId: z.uuid(),
});
const bulkDeleteBodySchema = z.object({
  leadIds: z.array(z.uuid()).min(1).max(100).transform((leadIds) => [...new Set(leadIds)]),
});
const bulkUpdateLeadIdsSchema = z.array(z.uuid()).min(1).max(100).transform((leadIds) => [...new Set(leadIds)]);
const bulkUpdateBodySchema = z.discriminatedUnion("field", [
  z.object({ leadIds: bulkUpdateLeadIdsSchema, field: z.literal("pipelineStageId"), value: z.uuid() }),
  z.object({ leadIds: bulkUpdateLeadIdsSchema, field: z.literal("sourceId"), value: z.uuid() }),
  z.object({ leadIds: bulkUpdateLeadIdsSchema, field: z.literal("originId"), value: z.uuid() }),
  z.object({ leadIds: bulkUpdateLeadIdsSchema, field: z.literal("monthlyRevenue"), value: z.iso.date() }),
  z.object({ leadIds: bulkUpdateLeadIdsSchema, field: z.literal("note"), value: noteBodySchema.shape.content }),
]);
const customFieldValuesSchema = z.object({ values: z.array(z.object({ fieldId: z.uuid(), value: z.unknown().nullable() })).min(1).max(100) });

export const leadsRouter = Router();

leadsRouter.get("/export", requireAuthentication, requireAnyPermission("lead.export_all", "lead.export"), async (request, response, next) => {
  try {
    const parsed = leadListQuerySchema.safeParse(request.query);
    const programId = getInstitutionProgramScope(request);
    if (!parsed.success || !programId) { response.status(400).json({ message: "Bộ lọc hoặc chương trình xuất dữ liệu không hợp lệ." }); return; }
    const config = await getPreference(programId, "exports");
    const sensitive = canCheckSensitiveDuplicates(request.authUser!);
    const columns = config.columns.filter(column => sensitive || !["phone", "email"].includes(column));
    if (!columns.length) { response.status(403).json({ message: "Bạn không có quyền xuất các cột đã chọn." }); return; }
    const page = await listLeads(request.authUser!, { ...parsed.data, institutionProgramId: programId, filterConditions: parsed.data.filters });
    const labels = { leadCode: "Mã lead", fullName: "Họ và tên", phone: "Số điện thoại", email: "Email", createdAt: "Ngày tạo" };
    const rows = page.data.map(lead => Object.fromEntries(columns.map(column => {
      const raw = String(lead[column] ?? "");
      return [labels[column], /^[=+@\-\t\r\n]/.test(raw) ? `'${raw}` : raw];
    })));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: columns.map(column => labels[column]) });
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Lead");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: config.format });
    await prisma.audit_logs.create({ data: { user_id: request.authUser!.id, entity_type: "lead_export", action: "export", ip_address: request.ip, new_data: { institutionProgramId: programId, page: parsed.data.page, count: rows.length, columns, format: config.format } } });
    response.setHeader("Content-Type", config.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="leads-page-${parsed.data.page}.${config.format}"`);
    response.send(buffer);
  } catch (error) { next(error); }
});
leadsRouter.use(["/bulk-assign", "/bulk-delete", "/bulk-update"], requireAuthentication, async (request, response, next) => {
  try {
    const ids = z.array(z.uuid()).min(1).max(100).safeParse(request.body?.leadIds);
    if (!ids.success) { next(); return; }
    const hasStudent = await prisma.students.findFirst({ where: { lead_id: { in: ids.data }, ...enrolledStudentWhere }, select: { id: true } });
    if (hasStudent && (!request.authUser!.permissions.some((p) => ["student.view", "student.view_all"].includes(p)) ||
        !request.authUser!.permissions.some((p) => ["student.update", "student.update_all"].includes(p)))) {
      response.status(403).json({ message: "Bạn chưa được cấp quyền chỉnh sửa học viên." }); return;
    }
    next();
  } catch (error) { next(error); }
});
leadsRouter.use("/:leadId", requireAuthentication, async (request, response, next) => {
  try {
    const id = z.uuid().safeParse(request.params.leadId);
    if (!id.success) { next(); return; }
    const student = await prisma.students.findFirst({ where: { lead_id: id.data, ...enrolledStudentWhere }, select: { id: true } });
    if (student) {
      const permissions = request.authUser!.permissions;
      const canView = permissions.some((p) => ["student.view", "student.view_all"].includes(p));
      const canWrite = request.method === "GET" || request.path === "/membership" || permissions.some((p) => ["student.update", "student.update_all"].includes(p));
      if (!canView || !canWrite) { response.status(403).json({ message: "Bạn chưa được cấp quyền xem hoặc chỉnh sửa học viên." }); return; }
    }
    next();
  } catch (error) { next(error); }
});

leadsRouter.post("/:leadId/membership", requireAuthentication, requireAnyPermission(...leadListPermissions), async (request, response, next) => {
  try {
    const id = z.uuid().safeParse(request.params.leadId);
    const body = z.object({ target: z.enum(["student", "candidate"]) }).strict().safeParse(request.body);
    if (!id.success || !body.success) { response.status(400).json({ message: "Yêu cầu chuyển đổi không hợp lệ." }); return; }
    const result = await changeStudentMembership(request.authUser!, id.data, body.data.target, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      const status = result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 409;
      response.status(status).json({ message: status === 403 ? "Bạn chưa được cấp quyền chuyển đổi." : status === 404 ? "Không tìm thấy hồ sơ trong phạm vi của bạn." : "Hồ sơ đã ở danh sách đích." }); return;
    }
    response.json(result.data);
  } catch (error) { next(error); }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
const uploadLeadImport: RequestHandler = (request, response, next) => {
  upload.single("file")(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      response.status(400).json({
        message: error.code === "LIMIT_FILE_SIZE"
          ? "File Excel không được vượt quá 5MB."
          : "Không thể tải file Excel lên. Vui lòng chỉ chọn một file.",
      });
      return;
    }
    next(error);
  });
};

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

      if (parsed.data.audience === "students" && !request.authUser!.permissions.some((p) => ["student.view", "student.view_all"].includes(p))) {
        response.status(403).json({ message: "Bạn chưa được cấp quyền xem học viên." }); return;
      }
      const result = await listLeads(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
        filterConditions: parsed.data.filters,
      });
      response.json(result);
    } catch (error) {
      if (error instanceof LeadFilterError) {
        response.status(error.status).json({ message: error.message });
        return;
      }
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
      const audience = z.enum(["candidates", "students", "all"]).default("candidates").safeParse(request.query.audience);
      if (!audience.success) { response.status(400).json({ message: "Nhóm hồ sơ không hợp lệ." }); return; }
      if (audience.data === "students" && !request.authUser!.permissions.some((p) => ["student.view", "student.view_all"].includes(p))) {
        response.status(403).json({ message: "Bạn chưa được cấp quyền xem học viên." }); return;
      }
      response.json(await getLeadFilterOptions(request.authUser!, getInstitutionProgramScope(request), audience.data));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get(
  "/action-options",
  requireAuthentication,
  requireAnyPermission("lead.create", ...leadListPermissions),
  async (request, response, next) => {
    try {
      response.json(await getLeadActionOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get(
  "/duplicates",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsed = duplicateQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số kiểm tra trùng không hợp lệ." });
        return;
      }
      if (parsed.data.field !== "fullName" && !canCheckSensitiveDuplicates(request.authUser!)) {
        response.status(403).json({ message: "Bạn không có quyền xem số điện thoại hoặc email của lead." });
        return;
      }
      response.json(await listDuplicateLeads(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request),
      }));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/duplicates/members",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsed = duplicateMembersQuerySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số nhóm lead trùng không hợp lệ." });
        return;
      }
      if (parsed.data.field !== "fullName" && !canCheckSensitiveDuplicates(request.authUser!)) {
        response.status(403).json({ message: "Bạn không có quyền xem số điện thoại hoặc email của lead." });
        return;
      }
      response.json(await listDuplicateGroupMembers(request.authUser!, {
        ...parsed.data,
        institutionProgramId: getInstitutionProgramScope(request),
      }));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/bulk-assign",
  requireAuthentication,
  requireAnyPermission("lead.assign", "lead.reassign"),
  async (request, response, next) => {
    try {
      const parsed = bulkAssignmentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin phân công hàng loạt không hợp lệ." });
        return;
      }
      const result = await assignLeads(
        request.authUser!,
        parsed.data.leadIds,
        { assigneeId: parsed.data.assigneeId },
        getInstitutionProgramScope(request),
        request.ip,
      );
      if (!result.ok) {
        response.status(result.reason === "lead_not_found" ? 404 : 400).json({
          message: result.reason === "lead_not_found"
            ? "Có lead không tồn tại hoặc nằm ngoài phạm vi truy cập. Không có lead nào được phân công."
            : "Nhân viên sale không hoạt động hoặc nằm ngoài phạm vi phân công của bạn.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get(
  "/bulk-update/options",
  requireAuthentication,
  requireAnyPermission("lead_note.create", ...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      response.json(await getBulkUpdateFieldOptions(request.authUser!, getInstitutionProgramScope(request)));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/bulk-update",
  requireAuthentication,
  requireAnyPermission("lead_note.create", ...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsed = bulkUpdateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin cập nhật hàng loạt không hợp lệ." });
        return;
      }
      const { leadIds, ...update } = parsed.data;
      const result = await bulkUpdateLeads(request.authUser!, leadIds, update, getInstitutionProgramScope(request), request.ip);
      if (!result.ok) {
        const failure = {
          permission_denied: [403, "Bạn không có quyền cập nhật trường này."],
          lead_not_found: [404, "Có lead không tồn tại hoặc nằm ngoài phạm vi truy cập. Không có lead nào được cập nhật."],
          stage_not_found: [400, "Tiến trình đã chọn không tồn tại."],
        } as const;
        const [status, message] = failure[result.reason];
        response.status(status).json({ message });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  "/bulk-delete",
  requireAuthentication,
  requireAnyPermission("lead.delete"),
  async (request, response, next) => {
    try {
      const parsed = bulkDeleteBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Danh sách lead cần xóa không hợp lệ." });
        return;
      }
      const result = await deleteLeads(
        request.authUser!,
        parsed.data.leadIds,
        getInstitutionProgramScope(request),
        request.ip,
      );
      if (!result.ok) {
        response.status(404).json({
          message: "Có lead không tồn tại hoặc nằm ngoài phạm vi truy cập. Không có lead nào bị xóa.",
        });
        return;
      }
      response.json(result.data);
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
      const parsed = createLeadBodySchema.safeParse({
        ...request.body,
        ...(institutionProgramId ? { institutionProgramId } : {}),
      });
      if (!parsed.success || !await hasAllRequiredLeadFields(parsed.data as Record<string, unknown>)) {
        response.status(400).json({ message: "Dữ liệu tạo lead không hợp lệ." });
        return;
      }
      const result = await createLead(request.authUser!, parsed.data, request.ip);
      if (!result.ok) {
        if (
          result.reason === "permission_denied" ||
          result.reason === "assignment_forbidden"
        ) {
          response.status(403).json({
            message:
              result.reason === "assignment_forbidden"
                ? "Bạn không có quyền phân công Sale phụ trách khi tạo lead."
                : "Bạn không có quyền tạo lead.",
          });
          return;
        }
        response.status(result.reason === "phone_already_exists" ? 409 : 400).json({
          message: result.reason === "phone_already_exists"
            ? "Số điện thoại đã tồn tại trong danh sách lead."
            : result.reason === "source_not_found"
            ? "Nguồn học viên không tồn tại."
            : result.reason === "stage_not_found"
              ? "Tiến trình đã chọn không tồn tại."
            : result.reason === "assignee_not_telesale"
              ? "Sale phụ trách phải là người dùng Telesale đang hoạt động."
            : result.reason === "secondary_assignee_invalid"
              ? "Nhân viên phụ phải là người dùng Telesale đang hoạt động trong phạm vi được phép."
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

leadsRouter.get(
  "/custom-fields",
  requireAuthentication,
  requireAnyPermission("lead.create", ...leadListPermissions, ...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsed = z.object({
        institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || null),
      }).safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Chương trình tuyển sinh không hợp lệ." });
        return;
      }
      const canEdit = request.authUser!.permissions.includes("lead.create")
        || request.authUser!.permissions.some((permission) => leadUpdatePermissions.includes(permission as typeof leadUpdatePermissions[number]));
      response.json(await getLeadCustomFieldDefinitions(request.authUser!, parsed.data.institutionProgramId, canEdit));
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.post(
  ["/import", "/import/preview"],
  requireAuthentication,
  requireAnyPermission("lead.create"),
  uploadLeadImport,
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

      response.json(
        await importLeadsFromWorkbook(
          request.authUser!,
          request.file.buffer,
          request.header("x-institution-program-id") ? getInstitutionProgramScope(request) : undefined,
          request.ip,
          { preview: request.path.endsWith("/preview") },
        ),
      );
    } catch (error) {
      if (error instanceof InvalidLeadImportFileError) {
        response.status(400).json({ message: error.message });
        return;
      }
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
      if (!parsedId.success || !parsedBody.success || !await hasAllRequiredLeadFields(parsedBody.data as Record<string, unknown>)) {
        response.status(400).json({ message: "Dữ liệu cập nhật lead không hợp lệ." });
        return;
      }
      const result = await updateLead(
        request.authUser!,
        parsedId.data,
        parsedBody.data,
        institutionProgramId,
        request.ip,
      );
      if (!result.ok && result.reason === "lead_not_found") {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      if (!result.ok) {
        if (result.reason === "assignment_forbidden") {
          response.status(403).json({ message: "Bạn không có quyền thay đổi Sale phụ trách." });
          return;
        }
        if (result.reason === "note_template_invalid") {
          response.status(400).json({ message: "Mẫu ghi chú không còn hoạt động hoặc không thuộc tiến trình đích. Hãy chọn lại hoặc bỏ qua ghi chú." });
          return;
        }
        response.status(result.reason === "phone_already_exists" ? 409 : 400).json({
          message: result.reason === "phone_already_exists"
            ? "Số điện thoại đã tồn tại trong danh sách lead."
            : result.reason === "source_not_found"
            ? "Nguồn học viên không tồn tại."
            : result.reason === "stage_not_found"
              ? "Tiến trình đã chọn không tồn tại."
            : result.reason === "assignee_not_telesale"
              ? "Sale phụ trách phải là người dùng Telesale đang hoạt động."
            : result.reason === "secondary_assignee_invalid"
              ? "Nhân viên phụ phải là người dùng Telesale đang hoạt động trong phạm vi được phép."
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

leadsRouter.post(
  "/:id/open",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        response.status(400).json({ message: "Mã lead không hợp lệ." });
        return;
      }
      const result = await initializeLeadOnOpen(request.authUser!, parsedId.data, getInstitutionProgramScope(request), request.ip);
      if (!result.ok) {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      response.json(result.data);
    } catch (error) { next(error); }
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
      const result = await changeLeadStage(
        request.authUser!,
        parsedId.data,
        parsedBody.data.stageId,
        getInstitutionProgramScope(request),
        request.ip,
        parsedBody.data.noteTemplateId,
        parsedBody.data.noteContent,
      );
      if (!result.ok) {
        if (result.reason === "lead_failed") {
          response.status(409).json({ message: "Lead đang ở trạng thái Fail. Hãy chuyển về Active trước khi đổi tiến trình." });
          return;
        }
        if (result.reason === "note_template_invalid") {
          response.status(400).json({ message: "Mẫu ghi chú không còn hoạt động hoặc không thuộc tiến trình đích. Hãy chọn lại hoặc bỏ qua ghi chú." });
          return;
        }
        response.status(404).json({ message: result.reason === "lead_not_found"
          ? "Không tìm thấy lead trong phạm vi truy cập."
          : "Không tìm thấy giai đoạn pipeline." });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.patch(
  "/:id/status",
  requireAuthentication,
  requireAnyPermission(...leadUpdatePermissions),
  async (request, response, next) => {
    try {
      const parsedId = leadIdSchema.safeParse(request.params.id);
      const parsedBody = lifecycleStatusBodySchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        response.status(400).json({ message: "Dữ liệu trạng thái lead không hợp lệ." });
        return;
      }
      const result = await changeLeadStatus(
        request.authUser!,
        parsedId.data,
        parsedBody.data.status,
        getInstitutionProgramScope(request),
        request.ip,
        parsedBody.data.noteTemplateId,
        parsedBody.data.noteContent,
      );
      if (!result.ok) {
        const messages = {
          lead_not_found: "Không tìm thấy lead trong phạm vi truy cập.",
          stage_required: "Lead cần có tiến trình trước khi chuyển sang Fail.",
          stage_not_found: "Không thể tìm thấy tiến trình cần lưu hoặc khôi phục.",
          permission_denied: "Bạn không có quyền cập nhật trạng thái lead.",
          note_template_invalid: "Mẫu ghi chú không còn hoạt động hoặc không thuộc trạng thái đích. Hãy chọn lại hoặc bỏ qua ghi chú.",
        } as const;
        const statusCode = result.reason === "permission_denied"
          ? 403
          : result.reason === "lead_not_found"
            ? 404
            : result.reason === "note_template_invalid" ? 400 : 409;
        response.status(statusCode).json({ message: messages[result.reason] });
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
      const result = await deleteLead(
        request.authUser!,
        parsedId.data,
        getInstitutionProgramScope(request),
        request.ip,
      );
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
      const result = await addLeadNote(
        request.authUser!,
        parsedId.data,
        parsedBody.data.content,
        getInstitutionProgramScope(request),
        request.ip,
      );
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
      const result = await attachLeadFile(
        request.authUser!,
        parsedId.data,
        parsedBody.data,
        getInstitutionProgramScope(request),
        request.ip,
      );
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
      const result = await assignLead(
        request.authUser!,
        parsedId.data,
        parsedBody.data,
        getInstitutionProgramScope(request),
        request.ip,
      );
      if (!result.ok) {
        response.status(result.reason === "lead_not_found" ? 404 : 400).json({
          message: result.reason === "lead_not_found"
            ? "Không tìm thấy lead trong phạm vi truy cập."
            : "Sale phụ trách phải là người dùng Telesale đang hoạt động và thuộc phòng ban hợp lệ.",
        });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

leadsRouter.get("/:id/transition-note-options", requireAuthentication, requireAnyPermission(...leadUpdatePermissions), async (request, response, next) => {
  try {
    const id = leadIdSchema.safeParse(request.params.id);
    const target = transitionNoteTargetSchema.safeParse(request.query.target);
    if (!id.success || !target.success) return response.status(400).json({ message: "Tiến trình hoặc trạng thái đích không hợp lệ." });
    const result = await getVisibleTransitionNoteOptions(request.authUser!, id.data, target.data, getInstitutionProgramScope(request));
    if (!result.ok) return response.status(404).json({ message: result.reason === "lead_not_found" ? "Không tìm thấy lead trong phạm vi truy cập." : "Không tìm thấy tiến trình đích." });
    response.json(result.data);
  } catch (error) { next(error); }
});

leadsRouter.get(
  "/:id/custom-fields",
  requireAuthentication,
  requireAnyPermission(...leadListPermissions),
  async (request, response, next) => {
    try {
      const parsed = leadIdSchema.safeParse(request.params.id);
      if (!parsed.success) {
        response.status(400).json({ message: "Mã lead không hợp lệ." });
        return;
      }
      const data = await getLeadCustomFields(
        request.authUser!,
        parsed.data,
        getInstitutionProgramScope(request),
      );
      if (!data) {
        response.status(404).json({ message: "Không tìm thấy lead trong phạm vi truy cập." });
        return;
      }
      response.json(data);
    } catch (error) {
      next(error);
    }
  },
);
leadsRouter.patch("/:id/custom-fields", requireAuthentication, requireAnyPermission(...leadUpdatePermissions), async (request, response, next) => { try { const parsedId = leadIdSchema.safeParse(request.params.id), parsedBody = customFieldValuesSchema.safeParse(request.body); if (!parsedId.success || !parsedBody.success) return response.status(400).json({ message: "Giá trị trường dữ liệu không hợp lệ." }); const result = await patchLeadCustomFields(request.authUser!, parsedId.data, parsedBody.data.values, request.ip, getInstitutionProgramScope(request)); if (!result.ok) return response.status(result.reason === "not_found" ? 404 : result.reason === "forbidden" || result.reason === "sensitive_forbidden" ? 403 : 400).json({ message: result.reason === "sensitive_forbidden" ? "Bạn không có quyền sửa trường dữ liệu nhạy cảm." : "Không thể lưu trường dữ liệu tùy chỉnh." }); response.json({ message: "Đã lưu trường dữ liệu tùy chỉnh." }); } catch (error) { next(error); } });

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
