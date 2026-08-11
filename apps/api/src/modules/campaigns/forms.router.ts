import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { requireAnyPermission, requireAuthentication } from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { getMarketingFormFilterOptions, listMarketingFormSubmissions, listMarketingForms } from "./marketing-reference.service";
import {
  createMarketingForm,
  createMarketingFormField,
  deleteMarketingForm,
  deleteMarketingFormField,
  duplicateMarketingForm,
  getMarketingFormById,
  listMarketingFormFields,
  listMarketingFormTemplates,
  publishMarketingForm,
  reorderMarketingFormFields,
  supportedLeadMappingFields,
  supportedMarketingFormFieldTypes,
  supportedMarketingFormStatuses,
  supportedMarketingFormTypes,
  updateMarketingForm,
  updateMarketingFormField,
} from "./marketing-form-management.service";

const canViewForms = requireAnyPermission("campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own");
const canCreateForms = requireAnyPermission("marketing_form.manage", "marketing_form.create");
const canUpdateForms = requireAnyPermission("marketing_form.manage", "marketing_form.update_own");
const canDeleteForms = requireAnyPermission("marketing_form.manage");

const idSchema = z.uuid();
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
  platform: z.string().trim().max(100).optional().transform((value) => value || undefined),
  campaignId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sortBy: z.enum(["createdAt", "name", "platform", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
const validationRulesSchema = z.record(z.string(), z.unknown()).optional().nullable();
const settingsSchema = z.record(z.string(), z.unknown()).optional().default({});
const fieldSchema = z.object({
  fieldKey: z.string().trim().min(1).max(150).regex(/^[A-Za-z0-9_.-]+$/),
  label: z.string().trim().min(1).max(255),
  placeholder: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  fieldType: z.enum(supportedMarketingFormFieldTypes),
  isRequired: z.boolean().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(255)).max(100).default([]),
  validationRules: validationRulesSchema,
  leadField: z.enum(supportedLeadMappingFields).optional().nullable().transform((value) => value ?? undefined),
  crmMappingField: z.enum(supportedLeadMappingFields).optional().nullable().transform((value) => value ?? undefined),
  defaultValue: z.string().trim().max(1000).optional().or(z.literal("")).nullable().transform((value) => value || undefined),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
}).transform((field) => ({ ...field, isRequired: field.isRequired ?? field.required ?? false }));
const formSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/).optional().or(z.literal("")).transform((value) => value || undefined),
  platform: z.string().trim().max(100).optional().or(z.literal("")).transform((value) => value || undefined),
  formCode: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  campaignId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  sourceId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  formType: z.enum(supportedMarketingFormTypes).default("lead_form"),
  title: z.string().trim().max(255).optional().or(z.literal("")).transform((value) => value || undefined),
  subtitle: z.string().trim().max(500).optional().or(z.literal("")).transform((value) => value || undefined),
  description: z.string().trim().max(2000).optional().or(z.literal("")).transform((value) => value || undefined),
  submitButtonLabel: z.string().trim().max(150).optional().or(z.literal("")).transform((value) => value || undefined),
  submitButtonText: z.string().trim().max(150).optional().or(z.literal("")).transform((value) => value || undefined),
  templateId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
  primaryColor: z.string().trim().max(32).optional().or(z.literal("")).transform((value) => value || undefined),
  backgroundColor: z.string().trim().max(32).optional().or(z.literal("")).transform((value) => value || undefined),
  webhookEnabled: z.boolean().default(false),
  status: z.enum(supportedMarketingFormStatuses),
  displaySettings: settingsSchema,
  duplicateSettings: settingsSchema,
  successSettings: settingsSchema,
  accessSettings: settingsSchema,
  closeSettings: settingsSchema,
  advancedSettings: settingsSchema,
  fields: z.array(fieldSchema).max(100).optional(),
  mappings: z.array(z.object({
    sourceField: z.string().trim().min(1).max(150).regex(/^[A-Za-z0-9_.-]+$/),
    leadField: z.enum(supportedLeadMappingFields).optional(),
    targetTable: z.string().trim().max(100).default("leads"),
    targetColumn: z.enum(supportedLeadMappingFields).optional(),
    isRequired: z.boolean(),
    transformRule: validationRulesSchema,
  })).max(50).optional(),
}).superRefine((input, context) => {
  const fieldKeys = new Set<string>();
  const leadFields = new Set<string>();
  for (const [index, field] of (input.fields ?? []).entries()) {
    if (fieldKeys.has(field.fieldKey)) {
      context.addIssue({ code: "custom", path: ["fields", index, "fieldKey"], message: "Mã trường không được trùng." });
    }
    fieldKeys.add(field.fieldKey);
    const mapped = field.crmMappingField ?? field.leadField;
    if (mapped) leadFields.add(mapped);
  }
  for (const [index, mapping] of (input.mappings ?? []).entries()) {
    const mapped = mapping.targetColumn ?? mapping.leadField;
    if (mapped) leadFields.add(mapped);
    if (!fieldKeys.has(mapping.sourceField) && (input.fields ?? []).length > 0) {
      context.addIssue({ code: "custom", path: ["mappings", index, "sourceField"], message: "Field mapping phải tồn tại trong form." });
    }
  }
  if (input.status === "published" && (!leadFields.has("full_name") || !leadFields.has("phone"))) {
    context.addIssue({ code: "custom", path: ["fields"], message: "Biểu mẫu cần mapping Họ tên và Số điện thoại trước khi xuất bản." });
  }
});
const submissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().max(50).optional().transform((value) => value || undefined),
});
const reorderSchema = z.object({ fieldIds: z.array(z.uuid()).min(1).max(100) });

export const formsRouter = Router();
export const formFieldsRouter = Router();

formsRouter.use(requireAuthentication);

formsRouter.get("/", canViewForms, async (request, response, next) => {
  try {
    const parsed = listQuerySchema.safeParse(request.query);
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

formsRouter.get("/options", canViewForms, async (request, response, next) => {
  try {
    const options = await getMarketingFormFilterOptions(request.authUser!, getInstitutionProgramScope(request));
    response.json({
      ...options,
      templates: await listMarketingFormTemplates(),
      leadFields: supportedLeadMappingFields,
      fieldTypes: supportedMarketingFormFieldTypes,
      formTypes: supportedMarketingFormTypes,
      statuses: supportedMarketingFormStatuses,
    });
  } catch (error) {
    next(error);
  }
});

formsRouter.post("/", canCreateForms, async (request, response, next) => {
  try {
    const parsed = formSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: "Dữ liệu tạo biểu mẫu không hợp lệ.", issues: parsed.error.issues });
      return;
    }
    const result = await createMarketingForm(request.authUser!, parsed.data, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy dữ liệu liên kết trong phạm vi được quản lý." });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.get("/:id", canViewForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã biểu mẫu không hợp lệ." });
      return;
    }
    const result = await getMarketingFormById(request.authUser!, parsedId.data);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.put("/:id", canUpdateForms, updateFormHandler);
formsRouter.patch("/:id", canUpdateForms, updateFormHandler);

async function updateFormHandler(request: Request, response: Response, next: NextFunction) {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = formSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu cập nhật biểu mẫu không hợp lệ.", issues: parsedBody.success ? undefined : parsedBody.error.issues });
      return;
    }
    const result = await updateMarketingForm(request.authUser!, parsedId.data, parsedBody.data, getInstitutionProgramScope(request), request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu hoặc dữ liệu liên kết trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
}

formsRouter.delete("/:id", canDeleteForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
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

formsRouter.post("/:id/publish", canUpdateForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã biểu mẫu không hợp lệ." });
      return;
    }
    const result = await publishMarketingForm(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(result.reason === "missing_required_mapping" ? 400 : 404).json({
        message: result.reason === "missing_required_mapping"
          ? "Biểu mẫu cần mapping Họ tên và Số điện thoại trước khi xuất bản."
          : "Không tìm thấy biểu mẫu trong phạm vi được quản lý.",
      });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.post("/:id/duplicate", canUpdateForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã biểu mẫu không hợp lệ." });
      return;
    }
    const result = await duplicateMarketingForm(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.get("/:id/fields", canViewForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã biểu mẫu không hợp lệ." });
      return;
    }
    const result = await listMarketingFormFields(request.authUser!, parsedId.data);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.post("/:id/fields", canUpdateForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = fieldSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu field không hợp lệ.", issues: parsedBody.success ? undefined : parsedBody.error.issues });
      return;
    }
    const result = await createMarketingFormField(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.status(201).json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.patch("/:id/fields/reorder", canUpdateForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedBody = reorderSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Thứ tự field không hợp lệ." });
      return;
    }
    const result = await reorderMarketingFormFields(request.authUser!, parsedId.data, parsedBody.data.fieldIds, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy biểu mẫu trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
});

formsRouter.get("/:id/submissions", canViewForms, async (request, response, next) => {
  try {
    const parsedId = idSchema.safeParse(request.params.id);
    const parsedQuery = submissionQuerySchema.safeParse(request.query);
    if (!parsedId.success || !parsedQuery.success) {
      response.status(400).json({ message: "Tham số danh sách kết quả không hợp lệ." });
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

formFieldsRouter.use(requireAuthentication);
formFieldsRouter.put("/:fieldId", canUpdateForms, fieldUpdateHandler);
formFieldsRouter.delete("/:fieldId", canUpdateForms, fieldDeleteHandler);

async function fieldUpdateHandler(request: Request, response: Response, next: NextFunction) {
  try {
    const parsedId = idSchema.safeParse(request.params.fieldId);
    const parsedBody = fieldSchema.safeParse(request.body);
    if (!parsedId.success || !parsedBody.success) {
      response.status(400).json({ message: "Dữ liệu field không hợp lệ.", issues: parsedBody.success ? undefined : parsedBody.error.issues });
      return;
    }
    const result = await updateMarketingFormField(request.authUser!, parsedId.data, parsedBody.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy field trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
}

async function fieldDeleteHandler(request: Request, response: Response, next: NextFunction) {
  try {
    const parsedId = idSchema.safeParse(request.params.fieldId);
    if (!parsedId.success) {
      response.status(400).json({ message: "Mã field không hợp lệ." });
      return;
    }
    const result = await deleteMarketingFormField(request.authUser!, parsedId.data, request.ip);
    if (!result.ok) {
      response.status(404).json({ message: "Không tìm thấy field trong phạm vi được quản lý." });
      return;
    }
    response.json(result.data);
  } catch (error) {
    next(error);
  }
}
