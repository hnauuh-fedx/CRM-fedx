import { Router } from "express";
import { z } from "zod";

import {
  requireAnyPermission,
  requireAuthentication,
} from "../../middlewares/auth.middleware";
import {
  getLeadSourceFilterOptions,
  getMarketingFormFilterOptions,
  getUtmTrackingFilterOptions,
  listMarketingFormSubmissions,
  listLeadSources,
  listMarketingForms,
  listUtmTrackings,
} from "./marketing-reference.service";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { getUtmAnalytics, listUtmGeneratedLeads } from "./utm-analytics.service";
import {
  createMarketingForm,
  deleteMarketingForm,
  rotateMarketingFormWebhookSecret,
  supportedMarketingFormFieldTypes,
  supportedMarketingFormTypes,
  supportedLeadMappingFields,
  updateMarketingForm,
} from "./marketing-form-management.service";
import { getPublicMarketingFormConfig, submitMarketingForm } from "./marketing-form-public.service";

const leadSourceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  type: z.string().trim().max(100).optional().transform((value) => value || undefined),
  institutionProgramId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "type"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const utmBaseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  source: z.string().trim().max(255).optional().transform((value) => value || undefined),
  medium: z.string().trim().max(255).optional().transform((value) => value || undefined),
  campaignId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  fromDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
  toDate: z.iso.date().optional().or(z.literal("")).transform((value) => value || undefined),
});
const validUtmDateRange = (input: { fromDate?: string; toDate?: string }) =>
  !input.fromDate || !input.toDate || input.toDate >= input.fromDate;
const utmQuerySchema = utmBaseQuerySchema.extend({
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "source", "medium"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(validUtmDateRange, {
  message: "Khoảng ngày theo dõi UTM không hợp lệ.",
});
const utmAnalyticsQuerySchema = utmBaseQuerySchema.extend({
  dimension: z.enum(["source", "campaign", "utm"]).default("source"),
}).refine(validUtmDateRange, {
  message: "Khoảng ngày theo dõi UTM không hợp lệ.",
});
const utmLeadsQuerySchema = utmBaseQuerySchema.extend({
  groupSource: z.string().trim().max(255).optional().transform((value) => value || undefined),
  groupMedium: z.string().trim().max(255).optional().transform((value) => value || undefined),
  groupCampaign: z.string().trim().max(255).optional().transform((value) => value || undefined),
  groupCampaignId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
}).refine(validUtmDateRange, {
  message: "Khoảng ngày theo dõi UTM không hợp lệ.",
});
const formQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  platform: z.string().trim().max(100).optional().transform((value) => value || undefined),
  campaignId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "platform", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const marketingFormIdSchema = z.uuid();
const marketingFormBodySchema = z.object({
  name: z.string().trim().min(2).max(255),
  platform: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  formCode: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  campaignId: z.uuid(),
  formType: z.enum(supportedMarketingFormTypes).default("lead_form"),
  title: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  description: z.string().trim().max(2000).optional().or(z.literal("")).transform((value) => value || undefined),
  submitButtonLabel: z.string().trim().max(150).optional().or(z.literal("")).transform((value) => value || undefined),
  webhookEnabled: z.boolean().default(false),
  status: z.enum(["draft", "active", "inactive", "closed"]),
  fields: z.array(z.object({
    fieldKey: z.string().trim().min(1).max(150).regex(/^[A-Za-z0-9_.-]+$/),
    label: z.string().trim().min(1).max(255),
    placeholder: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
    fieldType: z.enum(supportedMarketingFormFieldTypes),
    isRequired: z.boolean(),
    options: z.array(z.string().trim().min(1).max(255)).max(100).default([]),
    leadField: z.enum(supportedLeadMappingFields).optional(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })).max(100).optional(),
  mappings: z.array(z.object({
    sourceField: z.string().trim().min(1).max(150).regex(/^[A-Za-z0-9_.-]+$/),
    leadField: z.enum(supportedLeadMappingFields),
    isRequired: z.boolean(),
  })).min(2).max(50),
}).superRefine((input, context) => {
  const sourceFields = new Set<string>();
  const leadFields = new Set<string>();
  for (const [index, mapping] of input.mappings.entries()) {
    if (sourceFields.has(mapping.sourceField)) {
      context.addIssue({ code: "custom", path: ["mappings", index, "sourceField"], message: "Trường nguồn không được trùng." });
    }
    if (leadFields.has(mapping.leadField)) {
      context.addIssue({ code: "custom", path: ["mappings", index, "leadField"], message: "Trường lead không được ánh xạ trùng." });
    }
    sourceFields.add(mapping.sourceField);
    leadFields.add(mapping.leadField);
  }
  for (const requiredField of ["full_name", "phone"]) {
    if (!leadFields.has(requiredField)) {
      context.addIssue({ code: "custom", path: ["mappings"], message: "Biểu mẫu phải ánh xạ họ tên và số điện thoại về lead." });
    }
  }
  const fieldKeys = new Set<string>();
  for (const [index, field] of (input.fields ?? []).entries()) {
    if (fieldKeys.has(field.fieldKey)) {
      context.addIssue({ code: "custom", path: ["fields", index, "fieldKey"], message: "Mã trường không được trùng." });
    }
    fieldKeys.add(field.fieldKey);
  }
});
const submissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
});
const publicPayloadSchema = z.record(z.string(), z.unknown());

const publicRateLimits = new Map<string, { count: number; resetAt: number }>();
function isPublicRateLimited(key: string) {
  const now = Date.now();
  const current = publicRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    publicRateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

export const leadSourcesRouter = Router();
export const utmTrackingsRouter = Router();
export const marketingFormsRouter = Router();
export const publicMarketingFormsRouter = Router();

leadSourcesRouter.get("/", requireAuthentication, requireAnyPermission("campaign.view_all", "lead_source.manage"), async (request, response, next) => {
  try {
    const parsed = leadSourceQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách nguồn lead không hợp lệ." });
      return;
    }
    response.json(await listLeadSources({
      ...parsed.data,
      institutionProgramId: getInstitutionProgramScope(request) ?? parsed.data.institutionProgramId,
    }));
  } catch (error) {
    next(error);
  }
});

leadSourcesRouter.get("/options", requireAuthentication, requireAnyPermission("campaign.view_all", "lead_source.manage"), async (_request, response, next) => {
  try {
    response.json(await getLeadSourceFilterOptions());
  } catch (error) {
    next(error);
  }
});

utmTrackingsRouter.get("/", requireAuthentication, requireAnyPermission("campaign.view_all", "utm.view", "utm.view_own"), async (request, response, next) => {
  try {
    const parsed = utmQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách UTM không hợp lệ." });
      return;
    }
    response.json(await listUtmTrackings(request.authUser!, {
      ...parsed.data,
      institutionProgramId: getInstitutionProgramScope(request),
    }));
  } catch (error) {
    next(error);
  }
});

utmTrackingsRouter.get("/options", requireAuthentication, requireAnyPermission("campaign.view_all", "utm.view", "utm.view_own"), async (request, response, next) => {
  try {
    response.json(await getUtmTrackingFilterOptions(request.authUser!));
  } catch (error) {
    next(error);
  }
});

utmTrackingsRouter.get("/analytics", requireAuthentication, requireAnyPermission("campaign.view_all", "utm.view", "utm.view_own"), async (request, response, next) => {
  try {
    const parsed = utmAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số phân tích UTM không hợp lệ." });
      return;
    }
    response.json(await getUtmAnalytics(request.authUser!, {
      ...parsed.data,
      institutionProgramId: getInstitutionProgramScope(request),
    }));
  } catch (error) {
    next(error);
  }
});

utmTrackingsRouter.get("/leads", requireAuthentication, requireAnyPermission("campaign.view_all", "utm.view", "utm.view_own"), async (request, response, next) => {
  try {
    const parsed = utmLeadsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số lead phát sinh từ UTM không hợp lệ." });
      return;
    }
    response.json(await listUtmGeneratedLeads(request.authUser!, {
      ...parsed.data,
      institutionProgramId: getInstitutionProgramScope(request),
    }));
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.get("/", requireAuthentication, requireAnyPermission("campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own"), async (request, response, next) => {
  try {
    const parsed = formQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ message: "Tham số danh sách biểu mẫu không hợp lệ." });
      return;
    }
    response.json(await listMarketingForms(request.authUser!, {
      ...parsed.data,
      institutionProgramId: getInstitutionProgramScope(request),
    }));
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.get("/options", requireAuthentication, requireAnyPermission("campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own"), async (request, response, next) => {
  try {
    response.json({
      ...(await getMarketingFormFilterOptions(request.authUser!, getInstitutionProgramScope(request))),
      leadFields: supportedLeadMappingFields,
      fieldTypes: supportedMarketingFormFieldTypes,
      formTypes: supportedMarketingFormTypes,
    });
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.post("/", requireAuthentication, requireAnyPermission("marketing_form.manage", "marketing_form.create"), async (request, response, next) => {
  try {
    const parsed = marketingFormBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo biểu mẫu marketing không hợp lệ." });
      return;
    }
    const result = await createMarketingForm(request.authUser!, parsed.data, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy chiến dịch trong phạm vi được quản lý." });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.get("/:id/submissions", requireAuthentication, requireAnyPermission("campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own"), async (request, response, next) => {
  try {
    const parsedId = marketingFormIdSchema.safeParse(request.params.id);
    const parsedQuery = submissionQuerySchema.safeParse(request.query);
    if (!parsedId.success || !parsedQuery.success) {
      response.status(400).json({ message: "Tham số danh sách dữ liệu gửi vào không hợp lệ." });
      return;
    }
    const result = await listMarketingFormSubmissions(request.authUser!, parsedId.data, parsedQuery.data);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.post("/:id/rotate-secret", requireAuthentication, requireAnyPermission("marketing_form.manage", "marketing_form.update_own"), async (request, response, next) => {
  try {
    const parsedId = marketingFormIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã biểu mẫu không hợp lệ." });
      return;
    }
    const result = await rotateMarketingFormWebhookSecret(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.patch("/:id", requireAuthentication, requireAnyPermission("marketing_form.manage", "marketing_form.update_own"), async (request, response, next) => {
  try {
    const parsedId = marketingFormIdSchema.safeParse(request.params.id);
    const parsedBody = marketingFormBodySchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật biểu mẫu marketing không hợp lệ." });
      return;
    }
    const result = await updateMarketingForm(request.authUser!, parsedId.data, parsedBody.data, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(404).json({
        message: result.reason === "form_not_found"
          ? "Không tìm thấy biểu mẫu trong phạm vi được quản lý."
          : "Không tìm thấy chiến dịch trong phạm vi được quản lý.",
      });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

marketingFormsRouter.delete("/:id", requireAuthentication, requireAnyPermission("marketing_form.manage"), async (request, response, next) => {
  try {
    const parsedId = marketingFormIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã biểu mẫu không hợp lệ." });
      return;
    }
    const result = await deleteMarketingForm(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

publicMarketingFormsRouter.get("/forms/:publicKey", async (request, response, next) => {
  try {
    const publicKey = z.string().trim().min(2).max(160).safeParse(request.params.publicKey);
    if (!publicKey.success) {
      response.status(400).json({ message: "Đường dẫn biểu mẫu không hợp lệ." });
      return;
    }
    const config = await getPublicMarketingFormConfig(publicKey.data);
    if (!config) {
      response.status(404).json({ message: "Biểu mẫu không khả dụng." });
      return;
    }
    response.json(config);
  } catch (error) {
    next(error);
  }
});

publicMarketingFormsRouter.post("/forms/:publicKey/submit", async (request, response, next) => {
  try {
    const publicKey = z.string().trim().min(2).max(160).safeParse(request.params.publicKey);
    const payload = publicPayloadSchema.safeParse(request.body);
    if (!publicKey.success || !payload.success) {
      response.status(400).json({ message: "Dữ liệu gửi lên không hợp lệ." });
      return;
    }
    if (isPublicRateLimited(`form:${publicKey.data}:${request.ip}`)) {
      response.status(429).json({ message: "Bạn gửi quá nhiều lần. Vui lòng thử lại sau." });
      return;
    }
    const result = await submitMarketingForm({
      publicKey: publicKey.data,
      payload: payload.data,
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    });
    if (!result.ok) {
      response.status(result.status).json({ message: result.message, submissionId: result.submissionId, redirectUrl: result.redirectUrl });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

publicMarketingFormsRouter.post("/webhooks/forms/:publicKey", async (request, response, next) => {
  try {
    const publicKey = z.string().trim().min(2).max(160).safeParse(request.params.publicKey);
    const payload = publicPayloadSchema.safeParse(request.body);
    if (!publicKey.success || !payload.success) {
      response.status(400).json({ message: "Dữ liệu webhook không hợp lệ." });
      return;
    }
    if (isPublicRateLimited(`webhook:${publicKey.data}:${request.ip}`)) {
      response.status(429).json({ message: "Webhook gửi quá nhiều lần. Vui lòng thử lại sau." });
      return;
    }
    const result = await submitMarketingForm({
      publicKey: publicKey.data,
      payload: payload.data,
      webhookSecret: request.get("x-webhook-secret"),
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
      isWebhook: true,
    });
    if (!result.ok) {
      response.status(result.status).json({ message: result.message, submissionId: result.submissionId, redirectUrl: result.redirectUrl });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});
