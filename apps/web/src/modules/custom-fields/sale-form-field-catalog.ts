import type { SystemFormField, SystemFormFieldGroup } from "./form-field-catalog.types";

const field = (
  key: string,
  label: string,
  dataType: SystemFormField["dataType"],
  storage: string,
  config: Omit<SystemFormField, "key" | "label" | "dataType" | "storage"> = {},
): SystemFormField => ({ key, label, dataType, storage, ...config });

export const saleActivityFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Thông tin hoạt động",
    description: "Thông tin chính dùng để ghi nhận hoạt động chăm sóc lead.",
    fields: [
      field("leadId", "Lead", "SELECT", "lead_activities.lead_id", { isRequired: true, optionSource: "leads" }),
      field("type", "Loại hoạt động", "SELECT", "lead_activities.type", { isRequired: true, optionSource: "Danh sách loại hoạt động" }),
      field("content", "Nội dung", "TEXTAREA", "lead_activities.content", { isRequired: true }),
    ],
  },
  {
    id: "additional",
    label: "Thông tin bổ sung",
    description: "Các trường dữ liệu tự cấu hình cho form hoạt động sale.",
    fields: [],
  },
];

export const saleReminderFormFieldCatalog: SystemFormFieldGroup[] = [
  {
    id: "basic",
    label: "Thông tin nhắc việc",
    description: "Thông tin chính dùng để tạo và theo dõi nhắc việc sale.",
    fields: [
      field("leadId", "Lead", "SELECT", "reminders.lead_id", { isRequired: true, optionSource: "leads" }),
      field("title", "Tiêu đề", "TEXT", "reminders.title", { isRequired: true }),
      field("remindAt", "Thời hạn", "DATETIME", "reminders.remind_at", { isRequired: true }),
      field("content", "Nội dung", "TEXTAREA", "reminders.content"),
    ],
  },
  {
    id: "additional",
    label: "Thông tin bổ sung",
    description: "Các trường dữ liệu tự cấu hình cho form nhắc việc sale.",
    fields: [],
  },
];
