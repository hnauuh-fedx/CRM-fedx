import { Router } from "express";
import { z } from "zod";
import { preferenceSchemas, preferenceSections, simulatePreferences, type PreferenceSection, type SystemPreferences } from "@admission-crm/shared/system-preferences";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { getPreferenceSnapshots, listManualLeadCreators, savePreference } from "./system-preferences.service";
import { preferenceRevision } from "./system-preferences.service";
import { prisma } from "../../database/prisma";
import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import { getSystemFieldRequirements } from "../custom-fields/system-field-requirements.service";
import { getTransitionNoteConfiguration, setTransitionNoteTemplates } from "../leads/transition-note.service";
import { transitionNoteTargetSchema, transitionNoteTemplatesSchema } from "../leads/transition-note.schema";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import {
  createReportConfig,
  createSlaRule,
  deleteReportConfig,
  deleteSlaRule,
  deleteSystemSetting,
  getSystemManagementDashboard,
  updateReportConfig,
  updateSlaRule,
  upsertSystemSetting,
} from "./system-management.service";

const idSchema = z.uuid();
const settingSchema = z.object({
  key: z.string().trim().min(2).max(150),
  value: z.string().trim().max(5000).optional().or(z.literal("")).transform((value) => value || undefined),
  type: z.enum(["string", "number", "boolean", "json", "secret"]).optional().or(z.literal("")).transform((value) => value || undefined),
});
const slaSchema = z.object({
  name: z.string().trim().min(2).max(255),
  module: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  durationMinutes: z.coerce.number().int().min(1).max(525600),
  action: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  isActive: z.boolean().default(true),
});
const reportConfigSchema = z.object({
  name: z.string().trim().min(2).max(255),
  reportType: z.string().trim().min(2).max(100),
  filters: z.unknown().optional(),
  isActive: z.boolean().default(true),
});

export const systemRouter = Router();

systemRouter.use(requireAuthentication, requireAnyPermission("system.manage"));

systemRouter.get("/manual-lead-creators", async (request, response, next) => {
  try {
    const programId = getInstitutionProgramScope(request);
    const parsed = z.object({ search: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).max(10000).default(1), selectedIds: z.preprocess(value => typeof value === "string" ? value.split(",").filter(Boolean) : [], z.array(z.uuid()).max(500)) }).safeParse(request.query);
    if (!programId || !parsed.success) { response.status(400).json({ message: "Thông tin tìm người dùng hoặc chương trình không hợp lệ." }); return; }
    response.json(await listManualLeadCreators(programId, parsed.data.search, parsed.data.page, parsed.data.selectedIds));
  } catch (error) { next(error); }
});

systemRouter.get("/lead-form", async (_request, response, next) => {
  try {
    const setting = await prisma.system_settings.findUnique({ where: { key: "form_field_requirements.LEAD" }, select: { value: true } });
    response.json({ requirements: await getSystemFieldRequirements("LEAD"), revision: preferenceRevision(setting?.value) });
  } catch (error) { next(error); }
});
systemRouter.put("/lead-form", async (request, response, next) => {
  try {
    const parsed = z.object({ requirements: z.record(z.string(), z.boolean()), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(request.body);
    const fields = leadFormFieldCatalog.flatMap(group => group.fields).filter(field => !field.readOnly);
    if (!parsed.success || Object.entries(parsed.data.requirements).some(([key, value]) => {
      const field = fields.find(item => item.key === key);
      return !field || (field.requiredLocked && !value);
    })) { response.status(400).json({ message: "Trường bắt buộc không hợp lệ. Các trường cốt lõi luôn bắt buộc." }); return; }
    const saved = await prisma.$transaction(async tx => {
      const key = "form_field_requirements.LEAD";
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS locked`;
      const old = await tx.system_settings.findUnique({ where: { key }, select: { value: true } });
      if (preferenceRevision(old?.value) !== parsed.data.revision) return null;
      const value = JSON.stringify(parsed.data.requirements);
      const setting = await tx.system_settings.upsert({ where: { key }, create: { key, type: "json", value }, update: { value } });
      await tx.audit_logs.create({ data: { user_id: request.authUser!.id, entity_type: "system_field_requirement", entity_id: setting.id, action: "update", ip_address: request.ip, old_data: { value: old?.value ?? null }, new_data: { requirements: parsed.data.requirements } } });
      return { requirements: parsed.data.requirements, revision: preferenceRevision(value) };
    });
    if (!saved) { response.status(409).json({ message: "Cấu hình biểu mẫu đã thay đổi. Tải lại trước khi lưu." }); return; }
    response.json(saved);
  } catch (error) { next(error); }
});
systemRouter.get("/note-templates", async (_request, response, next) => {
  try { response.json(await getTransitionNoteConfiguration()); } catch (error) { next(error); }
});
systemRouter.put("/note-templates/:target", async (request, response, next) => {
  try {
    const target = transitionNoteTargetSchema.safeParse(request.params.target);
    const body = z.object({ templates: transitionNoteTemplatesSchema, revision: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(request.body);
    if (!target.success || !body.success) { response.status(400).json({ message: "Mẫu ghi chú không hợp lệ." }); return; }
    const result = await setTransitionNoteTemplates(request.authUser!, target.data, body.data.templates, request.ip, body.data.revision);
    if (!result.ok) { response.status(result.reason === "conflict" ? 409 : 404).json({ message: result.reason === "conflict" ? "Mẫu ghi chú đã thay đổi. Đóng và mở lại để tải bản mới." : "Không tìm thấy tiến trình." }); return; }
    response.json(result.data);
  } catch (error) { next(error); }
});

systemRouter.get("/preferences", async (request, response, next) => {
  try {
    const programId = getInstitutionProgramScope(request);
    if (!programId) { response.status(400).json({ message: "Vui lòng chọn chương trình để cấu hình." }); return; }
    response.json({ institutionProgramId: programId, sections: await getPreferenceSnapshots(programId) });
  } catch (error) { next(error); }
});

systemRouter.get("/preferences/:section/history", requireAnyPermission("audit.view"), async (request, response, next) => {
  try {
    const programId = getInstitutionProgramScope(request);
    const section = request.params.section as PreferenceSection;
    const paging = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).safeParse(request.query);
    if (!programId || !preferenceSections.includes(section) || !paging.success) { response.status(400).json({ message: "Nhóm cấu hình hoặc trang lịch sử không hợp lệ." }); return; }
    const entries = await prisma.audit_logs.findMany({ where: { entity_type: "system_preference", AND: [{ new_data: { path: ["institutionProgramId"], equals: programId } }, { new_data: { path: ["section"], equals: section } }] }, select: { id: true, created_at: true, users: { select: { full_name: true } }, old_data: true, new_data: true }, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: (paging.data.page - 1) * 20, take: 21 });
    response.json({ page: paging.data.page, hasMore: entries.length > 20, data: entries.slice(0, 20).map(entry => {
      const old = entry.old_data as { value?: unknown } | null;
      const parsed = preferenceSchemas[section].safeParse(old?.value);
      return { id: entry.id, createdAt: entry.created_at?.toISOString() ?? null, actor: entry.users?.full_name ?? "Hệ thống", previousValue: parsed.success ? parsed.data : null };
    }) });
  } catch (error) { next(error); }
});

systemRouter.put("/preferences/:section", async (request, response, next) => {
  try {
    const programId = getInstitutionProgramScope(request);
    const section = request.params.section as PreferenceSection;
    const body = z.object({ value: z.unknown(), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(request.body);
    if (!programId || !preferenceSections.includes(section) || !body.success || !preferenceSchemas[section].safeParse(body.data.value).success) {
      response.status(400).json({ message: "Cấu hình không hợp lệ. Kiểm tra các lựa chọn và chương trình áp dụng." }); return;
    }
    const saved = await savePreference(request.authUser!, programId, section, body.data.value, body.data.revision, request.ip);
    if (!saved.ok) {
      response.status(saved.reason === "conflict" ? 409 : 400).json({ message: saved.reason === "conflict" ? "Cấu hình đã được người khác thay đổi. Tải lại dữ liệu trước khi lưu." : "Danh sách có tài khoản không còn hoạt động hoặc không thuộc chương trình này. Vui lòng bỏ chọn tài khoản không hợp lệ." }); return;
    }
    response.json(saved.snapshot);
  } catch (error) { next(error); }
});

systemRouter.post("/preferences/simulate", async (request, response, next) => {
  try {
    if (!getInstitutionProgramScope(request)) { response.status(400).json({ message: "Vui lòng chọn chương trình." }); return; }
    const parsed = z.object({ source: z.enum(["excel", "bizfly", "inbound"]), duplicate: z.boolean(), preferences: z.object(preferenceSchemas).strict() }).strict().safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: "Dữ liệu thử quy tắc không hợp lệ." }); return; }
    response.json(simulatePreferences(parsed.data.preferences as SystemPreferences, parsed.data.source, parsed.data.duplicate));
  } catch (error) { next(error); }
});

function resultMessage(reason: string) {
  if (reason === "sla_not_found") return "Không tìm thấy cấu hình SLA.";
  if (reason === "report_config_not_found") return "Không tìm thấy cấu hình export/báo cáo.";
  return "Không tìm thấy cấu hình hệ thống.";
}

systemRouter.get("/", async (_request, response, next) => {
  try {
    response.json(await getSystemManagementDashboard());
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/settings", async (request, response, next) => {
  try {
    const parsed = settingSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu cấu hình không hợp lệ." });
      return;
    }
    const result = await upsertSystemSetting(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete("/settings/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã cấu hình không hợp lệ." });
      return;
    }
    const result = await deleteSystemSetting(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/sla-rules", async (request, response, next) => {
  try {
    const parsed = slaSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu SLA không hợp lệ." });
      return;
    }
    const result = await createSlaRule(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.patch("/sla-rules/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = slaSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật SLA không hợp lệ." });
      return;
    }
    const result = await updateSlaRule(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete("/sla-rules/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã SLA không hợp lệ." });
      return;
    }
    const result = await deleteSlaRule(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.post("/export-settings", async (request, response, next) => {
  try {
    const parsed = reportConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu cấu hình export không hợp lệ." });
      return;
    }
    const result = await createReportConfig(request.authUser!, parsed.data, request.ip);
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.patch("/export-settings/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = reportConfigSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật export không hợp lệ." });
      return;
    }
    const result = await updateReportConfig(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

systemRouter.delete("/export-settings/:id", async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã cấu hình export không hợp lệ." });
      return;
    }
    const result = await deleteReportConfig(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: resultMessage(result.reason) });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});
