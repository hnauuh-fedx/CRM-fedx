import { z } from "zod";
import { customFieldDataTypes, customFieldEntityTypes, customFieldScopeTypes, type CustomFieldInput } from "./custom-fields.types";

const optionSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  label: z.string().trim().min(1).max(255),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});
const fileLimitOptions = new Set([1, 5, 10]);

const common = z.object({
  fieldLabel: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().transform((value) => value || undefined),
  fieldType: z.enum(customFieldDataTypes),
  isRequired: z.boolean().default(false),
  isSearchable: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
  options: z.array(optionSchema).max(100).optional(),
  validationRules: z.record(z.string(), z.unknown()).optional(),
  defaultValue: z.unknown().optional(),
});

function validate(input: CustomFieldInput, context: z.RefinementCtx) {
  if (input.scopeType === "PROGRAM" && !input.programId) {
    context.addIssue({ code: "custom", path: ["programId"], message: "Trường theo chương trình phải có chương trình tuyển sinh." });
  }
  if (input.scopeType === "GLOBAL" && input.programId) {
    context.addIssue({ code: "custom", path: ["programId"], message: "Trường toàn cục không được gắn chương trình tuyển sinh." });
  }
  const select = input.fieldType === "SELECT" || input.fieldType === "MULTI_SELECT";
  if (select && !input.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Trường lựa chọn phải có ít nhất một lựa chọn." });
  }
  if (!select && input.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Chỉ trường lựa chọn mới có danh sách lựa chọn." });
  }
  if (input.options) {
    const codes = new Set<string>();
    for (const [index, option] of input.options.entries()) {
      if (codes.has(option.code)) context.addIssue({ code: "custom", path: ["options", index, "code"], message: "Mã lựa chọn không được trùng." });
      codes.add(option.code);
    }
  }
  if (input.isSensitive && (input.isSearchable || input.isFilterable)) {
    context.addIssue({ code: "custom", path: ["isSensitive"], message: "Trường nhạy cảm không được tìm kiếm hoặc lọc." });
  }
  if (input.fieldType === "FILE" && (input.isSearchable || input.isFilterable)) {
    context.addIssue({ code: "custom", path: ["fieldType"], message: "Trường file không hỗ trợ tìm kiếm hoặc lọc." });
  }
  if (input.fieldType === "FILE") {
    const maxFiles = input.validationRules?.maxFiles;
    if (maxFiles !== undefined && (typeof maxFiles !== "number" || !fileLimitOptions.has(maxFiles))) {
      context.addIssue({ code: "custom", path: ["validationRules", "maxFiles"], message: "Trường file chỉ được chọn tối đa 1, 5 hoặc 10 ảnh." });
    }
  }
}

export const createCustomFieldSchema = common.extend({
  fieldKey: z.string().trim().min(1).max(150).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
  entityType: z.enum(customFieldEntityTypes),
  groupId: z.uuid(),
  scopeType: z.enum(customFieldScopeTypes),
  programId: z.uuid().optional().or(z.literal("")).transform((value) => value || undefined),
}).superRefine(validate) as z.ZodType<CustomFieldInput>;

export const updateCustomFieldSchema = common.partial().extend({
  fieldKey: z.never().optional(),
  groupId: z.uuid().optional(),
  programId: z.uuid().nullable().optional(),
  scopeType: z.enum(customFieldScopeTypes).optional(),
  entityType: z.enum(customFieldEntityTypes).optional(),
}).strict().superRefine((input, context) => {
  if (input.isSensitive && (input.isSearchable || input.isFilterable)) {
    context.addIssue({ code: "custom", path: ["isSensitive"], message: "Trường nhạy cảm không được tìm kiếm hoặc lọc." });
  }
  if (input.fieldType === "FILE" && (input.isSearchable || input.isFilterable)) {
    context.addIssue({ code: "custom", path: ["fieldType"], message: "Trường file không hỗ trợ tìm kiếm hoặc lọc." });
  }
  const maxFiles = input.validationRules?.maxFiles;
  if (maxFiles !== undefined && (typeof maxFiles !== "number" || !fileLimitOptions.has(maxFiles))) {
    context.addIssue({ code: "custom", path: ["validationRules", "maxFiles"], message: "Trường file chỉ được chọn tối đa 1, 5 hoặc 10 ảnh." });
  }
});

export const listCustomFieldSchema = z.object({
  entityType: z.enum(customFieldEntityTypes).optional(),
  scopeType: z.enum(customFieldScopeTypes).optional(),
  programId: z.uuid().optional(),
  includeArchived: z.coerce.boolean().default(false),
});
export const statusCustomFieldSchema = z.object({ status: z.enum(["activate", "deactivate", "archive"]) });
export const reorderCustomFieldSchema = z.object({ fieldIds: z.array(z.uuid()).min(1).max(100) });
export const listCustomFieldGroupSchema = z.object({ entityType: z.enum(customFieldEntityTypes), includeArchived: z.coerce.boolean().default(false) });
export const createCustomFieldGroupSchema = z.object({
  entityType: z.enum(customFieldEntityTypes),
  groupKey: z.string().trim().min(1).max(150).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
  groupLabel: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().transform((value) => value || undefined),
  displayOrder: z.number().int().min(0).default(0),
});
export const updateCustomFieldGroupSchema = z.object({
  groupLabel: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
export const statusCustomFieldGroupSchema = z.object({ status: z.enum(["activate", "deactivate", "archive"]) });
