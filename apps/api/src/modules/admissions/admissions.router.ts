import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  approveAdmissionProfile,
  changeAdmissionStatus,
  convertAdmissionToStudent,
  createAdmissionProfile,
  getAdmissionActionOptions,
  updateAdmissionProfile,
  type AdmissionProfileInput,
} from "./admission-profile-management.service";
import {
  getAdmissionDocumentActionOptions,
  updateAdmissionDocumentStatus,
  uploadAdmissionDocument,
  type AdmissionDocumentInput,
  type AdmissionDocumentStatus,
} from "./admission-document-management.service";
import {
  getAdmissionDocumentOptions,
  getAdmissionFeeOptions,
  listAdmissionDocuments,
  listAdmissionFees,
  listAdmissionStatuses,
} from "./admission-business.service";
import {
  confirmAdmissionFeeDebt,
  listAdmissionFeeHistory,
  updateAdmissionFeePayment,
  type AdmissionDebtConfirmationInput,
  type AdmissionFeePaymentInput,
} from "./admission-fee-management.service";
import {
  createAdmissionStatus,
  deleteAdmissionStatus,
  getAdmissionStatusFlow,
  updateAdmissionStatus,
  updateAdmissionStatusFlow,
  type AdmissionStatusFlowInput,
  type AdmissionStatusInput,
} from "./admission-status-management.service";
import { getAdmissionFilterOptions, listAdmissionProfiles } from "./admission-list.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  statusId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  majorId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "admissionCode", "applicationReceivedDate"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const documentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  type: z.string().trim().max(150).optional().transform((value) => value || undefined),
  sortBy: z.enum(["uploadedAt", "documentType", "status"]).default("uploadedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const documentBodySchema = z.object({
  leadId: z.uuid(),
  documentType: z.string().trim().min(1).max(150),
  fileName: z.string().trim().max(255).optional(),
  fileUrl: z.string().trim().max(2000).optional(),
  mimeType: z.string().trim().max(100).optional(),
  fileSize: z.coerce.number().int().min(1).optional(),
}) satisfies z.ZodType<AdmissionDocumentInput>;

const documentStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "missing", "supplement_requested"]),
  note: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<{ status: AdmissionDocumentStatus; note?: string }>;

const statusQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "code"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const statusBodySchema = z.object({
  name: z.string().trim().min(1).max(150),
  code: z.string().trim().min(1).max(100),
  color: z.string().trim().max(50).optional(),
}) satisfies z.ZodType<AdmissionStatusInput>;

const statusFlowBodySchema = z.object({
  fromStatusId: z.uuid(),
  toStatusIds: z.array(z.uuid()).max(100),
}) satisfies z.ZodType<AdmissionStatusFlowInput>;

const feeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(100).optional().transform((value) => value || undefined),
  sortBy: z
    .enum(["createdAt", "admissionCode", "monthlyRevenue", "feeStatus", "tuitionStatus"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const feePaymentBodySchema = z.object({
  feeStatus: z.string().trim().max(100).optional(),
  tuitionStatus: z.string().trim().max(100).optional(),
  monthlyRevenue: z.string().trim().max(30).optional(),
  paymentAmount: z.string().trim().max(30).optional(),
  paymentMethod: z.string().trim().max(100).optional(),
  paidAt: z.string().trim().max(30).optional(),
  note: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<AdmissionFeePaymentInput>;

const debtConfirmationBodySchema = z.object({
  debtStatus: z.enum(["confirmed", "pending", "disputed"]),
  note: z.string().trim().max(1000).optional(),
}) satisfies z.ZodType<AdmissionDebtConfirmationInput>;

const profileBodySchema = z.object({
  leadId: z.uuid(),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  majorId: z.uuid(),
  admissionStatusId: z.uuid(),
  trainingType: z.string().trim().max(150).optional(),
  classCode: z.string().trim().max(100).optional(),
  subjectGroupCode: z.string().trim().max(100).optional(),
  subjectGroupName: z.string().trim().max(255).optional(),
  score1: z.string().trim().max(10).optional(),
  score2: z.string().trim().max(10).optional(),
  score3: z.string().trim().max(10).optional(),
  admissionScore: z.string().trim().max(10).optional(),
  applicationReceivedDate: z.string().trim().max(30).optional(),
  enrollmentBatch: z.string().trim().max(150).optional(),
  trainingCode: z.string().trim().max(100).optional(),
  registrationStation: z.string().trim().max(150).optional(),
  decisionNumber: z.string().trim().max(150).optional(),
  decisionSignedDate: z.string().trim().max(30).optional(),
  monthlyRevenue: z.string().trim().max(30).optional(),
  feeStatus: z.string().trim().max(100).optional(),
  tuitionStatus: z.string().trim().max(100).optional(),
}) satisfies z.ZodType<AdmissionProfileInput>;

const profileStatusBodySchema = z.object({ statusId: z.uuid() });
const approveBodySchema = z.object({
  statusId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});
const convertBodySchema = z.object({
  classId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
});

export const admissionsRouter = Router();

function admissionActionMessage(reason: string) {
  const messages: Record<string, string> = {
    class_not_found: "Lớp sinh viên không tồn tại.",
    invalid_status_transition: "Luồng xử lý không cho phép chuyển sang trạng thái này.",
    lead_not_found: "Không tìm thấy lead trong phạm vi truy cập.",
    major_not_found: "Ngành đăng ký không hợp lệ.",
    profile_already_exists: "Lead này đã có hồ sơ tuyển sinh.",
    profile_incomplete: "Hồ sơ thiếu lead, chương trình hoặc ngành để chuyển sang sinh viên.",
    profile_not_found: "Không tìm thấy hồ sơ tuyển sinh trong phạm vi truy cập.",
    program_not_found: "Chương trình tuyển sinh không hợp lệ.",
    program_required: "Vui lòng chọn chương trình tuyển sinh.",
    status_not_found: "Trạng thái hồ sơ không hợp lệ.",
    student_already_exists: "Hồ sơ này đã được chuyển sang sinh viên.",
  };
  return messages[reason] ?? "Không thể thực hiện thao tác hồ sơ tuyển sinh.";
}

function resolveProgramScope(request: Request, response: Response) {
  const scope = getInstitutionProgramScope(request);
  const canViewAll = request.authUser?.permissions.includes("admission.view_all");
  if (!canViewAll && !scope) {
    response.status(403).json({ message: "Vui lòng chọn chương trình tuyển sinh trước khi thao tác hồ sơ." });
    return { ok: false as const };
  }
  return { ok: true as const, scope };
}

function documentActionMessage(reason: string) {
  const messages: Record<string, string> = {
    document_not_found: "Không tìm thấy tài liệu hồ sơ trong phạm vi truy cập.",
    profile_not_found: "Không tìm thấy hồ sơ tuyển sinh trong phạm vi truy cập.",
  };
  return messages[reason] ?? "Không thể thực hiện thao tác tài liệu hồ sơ.";
}

function statusActionMessage(reason: string) {
  const messages: Record<string, string> = {
    status_code_exists: "Mã trạng thái đã tồn tại.",
    status_in_use: "Không thể xóa trạng thái đang được dùng bởi hồ sơ tuyển sinh.",
    status_not_found: "Không tìm thấy trạng thái hồ sơ.",
  };
  return messages[reason] ?? "Không thể thực hiện thao tác trạng thái hồ sơ.";
}

function feeActionMessage(reason: string) {
  const messages: Record<string, string> = {
    fee_profile_not_found: "Không tìm thấy hồ sơ phí / học phí trong phạm vi truy cập.",
  };
  return messages[reason] ?? "Không thể thực hiện thao tác phí / học phí.";
}

admissionsRouter.get(
  "/",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách hồ sơ không hợp lệ." });
        return;
      }

      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;

      response.json(await listAdmissionProfiles(request.authUser!, {
        ...parsed.data,
        institutionProgramId: programScope.scope ?? parsed.data.institutionProgramId,
      }));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/options",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      response.json(await getAdmissionFilterOptions(request.authUser!, programScope.scope));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/action-options",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view", "admission.update"),
  async (request, response, next) => {
    try {
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      response.json(await getAdmissionActionOptions(programScope.scope));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/",
  requireAuthentication,
  requireAnyPermission("admission.update"),
  async (request, response, next) => {
    try {
      const parsed = profileBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin hồ sơ tuyển sinh không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await createAdmissionProfile(
        request.authUser!,
        parsed.data,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: admissionActionMessage(result.reason) });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.put(
  "/:id",
  requireAuthentication,
  requireAnyPermission("admission.update"),
  async (request, response, next) => {
    try {
      const parsed = profileBodySchema.safeParse(request.body);
      const id = z.uuid().safeParse(request.params.id);
      if (!parsed.success || !id.success) {
        response.status(400).json({ message: "Thông tin hồ sơ tuyển sinh không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await updateAdmissionProfile(
        request.authUser!,
        id.data,
        parsed.data,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: admissionActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/:id/approve",
  requireAuthentication,
  requireAnyPermission("admission.approve"),
  async (request, response, next) => {
    try {
      const body = approveBodySchema.safeParse(request.body ?? {});
      const id = z.uuid().safeParse(request.params.id);
      if (!body.success || !id.success) {
        response.status(400).json({ message: "Thông tin duyệt hồ sơ không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await approveAdmissionProfile(
        request.authUser!,
        id.data,
        body.data.statusId,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: admissionActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/:id/status",
  requireAuthentication,
  requireAnyPermission("admission_status.update", "admission.update"),
  async (request, response, next) => {
    try {
      const body = profileStatusBodySchema.safeParse(request.body);
      const id = z.uuid().safeParse(request.params.id);
      if (!body.success || !id.success) {
        response.status(400).json({ message: "Thông tin chuyển trạng thái không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await changeAdmissionStatus(
        request.authUser!,
        id.data,
        body.data.statusId,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: admissionActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/:id/convert-to-student",
  requireAuthentication,
  requireAnyPermission("student.create_from_admission"),
  async (request, response, next) => {
    try {
      const body = convertBodySchema.safeParse(request.body ?? {});
      const id = z.uuid().safeParse(request.params.id);
      if (!body.success || !id.success) {
        response.status(400).json({ message: "Thông tin chuyển sinh viên không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await convertAdmissionToStudent(
        request.authUser!,
        id.data,
        body.data,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: admissionActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/documents",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view", "admission_document.view"),
  async (request, response, next) => {
    try {
      const parsed = documentQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách tài liệu hồ sơ không hợp lệ." });
        return;
      }

      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;

      response.json(await listAdmissionDocuments(request.authUser!, {
        ...parsed.data,
        institutionProgramId: programScope.scope,
      }));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/documents/options",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view", "admission_document.view"),
  async (request, response, next) => {
    try {
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      response.json(await getAdmissionDocumentOptions());
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/documents/action-options",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view", "admission_document.view", "admission_document.upload"),
  async (request, response, next) => {
    try {
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      response.json(await getAdmissionDocumentActionOptions(programScope.scope));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/documents",
  requireAuthentication,
  requireAnyPermission("admission_document.upload"),
  async (request, response, next) => {
    try {
      const parsed = documentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin tài liệu hồ sơ không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await uploadAdmissionDocument(
        request.authUser!,
        parsed.data,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: documentActionMessage(result.reason) });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/documents/:id/status",
  requireAuthentication,
  requireAnyPermission("admission_document.upload", "admission.approve"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      const parsed = documentStatusSchema.safeParse(request.body);
      if (!id.success || !parsed.success) {
        response.status(400).json({ message: "Thông tin trạng thái tài liệu không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await updateAdmissionDocumentStatus(
        request.authUser!,
        id.data,
        parsed.data.status,
        parsed.data.note,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: documentActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/statuses",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const parsed = statusQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách trạng thái hồ sơ không hợp lệ." });
        return;
      }

      response.json(await listAdmissionStatuses(parsed.data));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/statuses/flow",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (_request, response, next) => {
    try {
      response.json(await getAdmissionStatusFlow());
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/statuses",
  requireAuthentication,
  requireAnyPermission("admission_status.update"),
  async (request, response, next) => {
    try {
      const parsed = statusBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin trạng thái hồ sơ không hợp lệ." });
        return;
      }
      const result = await createAdmissionStatus(request.authUser!, parsed.data, request.ip);
      if (!result.ok) {
        response.status(400).json({ message: statusActionMessage(result.reason) });
        return;
      }
      response.status(201).json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.put(
  "/statuses/flow",
  requireAuthentication,
  requireAnyPermission("admission_status.update"),
  async (request, response, next) => {
    try {
      const parsed = statusFlowBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: "Thông tin luồng xử lý hồ sơ không hợp lệ." });
        return;
      }
      const result = await updateAdmissionStatusFlow(request.authUser!, parsed.data, request.ip);
      if (!result.ok) {
        response.status(400).json({ message: statusActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.put(
  "/statuses/:id",
  requireAuthentication,
  requireAnyPermission("admission_status.update"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      const parsed = statusBodySchema.safeParse(request.body);
      if (!id.success || !parsed.success) {
        response.status(400).json({ message: "Thông tin trạng thái hồ sơ không hợp lệ." });
        return;
      }
      const result = await updateAdmissionStatus(request.authUser!, id.data, parsed.data, request.ip);
      if (!result.ok) {
        response.status(400).json({ message: statusActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.delete(
  "/statuses/:id",
  requireAuthentication,
  requireAnyPermission("admission_status.update"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      if (!id.success) {
        response.status(400).json({ message: "Mã trạng thái hồ sơ không hợp lệ." });
        return;
      }
      const result = await deleteAdmissionStatus(request.authUser!, id.data, request.ip);
      if (!result.ok) {
        response.status(400).json({ message: statusActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/fees",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const parsed = feeQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ message: "Tham số danh sách phí / học phí không hợp lệ." });
        return;
      }

      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;

      response.json(await listAdmissionFees({
        ...parsed.data,
        institutionProgramId: programScope.scope,
      }));
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/fees/options",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      response.json(await getAdmissionFeeOptions());
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.get(
  "/fees/:id/history",
  requireAuthentication,
  requireAnyPermission("admission.view_all", "admission.view"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      if (!id.success) {
        response.status(400).json({ message: "Mã hồ sơ phí / học phí không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await listAdmissionFeeHistory(id.data, programScope.scope);
      if (!result.ok) {
        response.status(400).json({ message: feeActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/fees/:id/payment",
  requireAuthentication,
  requireAnyPermission("admission.update"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      const parsed = feePaymentBodySchema.safeParse(request.body);
      if (!id.success || !parsed.success) {
        response.status(400).json({ message: "Thông tin thanh toán không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await updateAdmissionFeePayment(
        request.authUser!,
        id.data,
        parsed.data,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: feeActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);

admissionsRouter.post(
  "/fees/:id/debt-confirmation",
  requireAuthentication,
  requireAnyPermission("admission.update"),
  async (request, response, next) => {
    try {
      const id = z.uuid().safeParse(request.params.id);
      const parsed = debtConfirmationBodySchema.safeParse(request.body);
      if (!id.success || !parsed.success) {
        response.status(400).json({ message: "Thông tin xác nhận công nợ không hợp lệ." });
        return;
      }
      const programScope = resolveProgramScope(request, response);
      if (!programScope.ok) return;
      const result = await confirmAdmissionFeeDebt(
        request.authUser!,
        id.data,
        parsed.data,
        request.ip,
        programScope.scope,
      );
      if (!result.ok) {
        response.status(400).json({ message: feeActionMessage(result.reason) });
        return;
      }
      response.json(result.data);
    } catch (error) {
      next(error);
    }
  },
);
