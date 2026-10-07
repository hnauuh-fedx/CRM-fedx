export const customFieldPermissionForms = {
  LEAD: { key: "lead", label: "Form lead", module: "sale" },
  SALE_ACTIVITY: { key: "sale_activity", label: "Form hoạt động Sale", module: "sale" },
  SALE_REMINDER: { key: "sale_reminder", label: "Form nhắc việc Sale", module: "sale" },
  MARKETING_CAMPAIGN: { key: "marketing_campaign", label: "Form chiến dịch Marketing", module: "marketing" },
  MARKETING_FORM: { key: "marketing_form", label: "Form & Survey Marketing", module: "marketing" },
  ADMISSION_PROFILE: { key: "admission_profile", label: "Form hồ sơ tuyển sinh", module: "admission" },
  ADMISSION_DOCUMENT: { key: "admission_document", label: "Form tài liệu hồ sơ", module: "admission" },
  ADMISSION_STATUS: { key: "admission_status", label: "Form trạng thái hồ sơ", module: "admission" },
  STUDENT: { key: "student", label: "Form sinh viên", module: "student" },
} as const;

export const customFieldPermissionActions = {
  view: "Xem cấu hình trường dữ liệu",
  create: "Tạo trường dữ liệu",
  update: "Cập nhật trường dữ liệu",
  archive: "Lưu trữ trường dữ liệu",
  manage_options: "Quản lý lựa chọn trường dữ liệu",
  manage_groups: "Quản lý nhóm trường dữ liệu",
  view_sensitive: "Xem cấu hình trường nhạy cảm",
  edit_sensitive: "Chỉnh sửa cấu hình trường nhạy cảm",
} as const;

export type CustomFieldPermissionAction = keyof typeof customFieldPermissionActions;
export function customFieldPermission(entityType: string, _action: CustomFieldPermissionAction): string {
  const form = customFieldPermissionForms[entityType as keyof typeof customFieldPermissionForms];
  return form ? `custom_field.${form.key}.manage` : "custom_field.unsupported";
}
export function hasCustomFieldPermission(permissions: string[], entityType: string, action: CustomFieldPermissionAction) {
  return entityType in customFieldPermissionForms && permissions.includes(customFieldPermission(entityType, action));
}
export const customFieldPermissionDefinitions = Object.entries(customFieldPermissionForms).map(([entityType, form]) => ({
  code: customFieldPermission(entityType, "view"),
  name: `Quản lý cấu hình trường dữ liệu — ${form.label}`,
  module: form.module,
}));

// Used only by development seeds when translating their previous global grants.
export function expandLegacyCustomFieldPermission(permission: { code: string; name: string; module: string }) {
  const action = permission.code.replace(/^custom_field\./, "");
  return permission.code.startsWith("custom_field.") && action in customFieldPermissionActions
    ? customFieldPermissionDefinitions
    : [permission];
}
