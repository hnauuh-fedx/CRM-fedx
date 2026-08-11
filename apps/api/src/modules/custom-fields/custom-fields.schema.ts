import { z } from "zod";
import { customFieldDataTypes, customFieldEntityTypes, customFieldScopeTypes, type CustomFieldInput } from "./custom-fields.types";

const optionSchema = z.object({ code: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/), label: z.string().trim().min(1).max(255), isActive: z.boolean().default(true), displayOrder: z.number().int().min(0).default(0) });
const common = z.object({ fieldLabel: z.string().trim().min(1).max(255), description: z.string().trim().max(2000).optional().transform((v) => v || undefined), fieldType: z.enum(customFieldDataTypes), isRequired: z.boolean().default(false), isSearchable: z.boolean().default(false), isFilterable: z.boolean().default(false), isSensitive: z.boolean().default(false), displayOrder: z.number().int().min(0).default(0), options: z.array(optionSchema).max(100).optional(), validationRules: z.record(z.string(), z.unknown()).optional(), defaultValue: z.unknown().optional() });

function validate(input: CustomFieldInput, context: z.RefinementCtx) {
  if (input.scopeType === "PROGRAM" && !input.programId) context.addIssue({ code: "custom", path: ["programId"], message: "Trường theo chương trình phải có chương trình tuyển sinh." });
  if (input.scopeType === "GLOBAL" && input.programId) context.addIssue({ code: "custom", path: ["programId"], message: "Trường toàn cục không được gắn chương trình tuyển sinh." });
  const select = input.fieldType === "SELECT" || input.fieldType === "MULTI_SELECT";
  if (select && !input.options?.length) context.addIssue({ code: "custom", path: ["options"], message: "Trường lựa chọn phải có ít nhất một lựa chọn." });
  if (!select && input.options?.length) context.addIssue({ code: "custom", path: ["options"], message: "Chỉ trường lựa chọn mới có danh sách lựa chọn." });
  if (input.options) { const codes = new Set<string>(); for (const [index, option] of input.options.entries()) { if (codes.has(option.code)) context.addIssue({ code: "custom", path: ["options", index, "code"], message: "Mã lựa chọn không được trùng." }); codes.add(option.code); } }
  if (input.isSensitive && (input.isSearchable || input.isFilterable)) context.addIssue({ code: "custom", path: ["isSensitive"], message: "Trường nhạy cảm không được tìm kiếm hoặc lọc." });
}

export const createCustomFieldSchema = common.extend({ fieldKey: z.string().trim().min(1).max(150).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/), entityType: z.enum(customFieldEntityTypes), scopeType: z.enum(customFieldScopeTypes), programId: z.uuid().optional().or(z.literal("")).transform((v) => v || undefined) }).superRefine(validate) as z.ZodType<CustomFieldInput>;
export const updateCustomFieldSchema = common.partial().extend({ fieldKey: z.never().optional(), programId: z.uuid().nullable().optional(), scopeType: z.enum(customFieldScopeTypes).optional(), entityType: z.enum(customFieldEntityTypes).optional() }).strict();
export const listCustomFieldSchema = z.object({ entityType: z.enum(customFieldEntityTypes).optional(), scopeType: z.enum(customFieldScopeTypes).optional(), programId: z.uuid().optional(), includeArchived: z.coerce.boolean().default(false) });
export const statusCustomFieldSchema = z.object({ status: z.enum(["activate", "deactivate", "archive"]) });
export const reorderCustomFieldSchema = z.object({ fieldIds: z.array(z.uuid()).min(1).max(100) });
