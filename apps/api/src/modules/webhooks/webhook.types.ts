export const webhookTargetModules = ["LEAD"] as const;
export const webhookStatuses = ["ACTIVE", "DISABLED"] as const;

export type WebhookTargetModule = (typeof webhookTargetModules)[number];
export type WebhookStatus = (typeof webhookStatuses)[number];

export const webhookFieldMetadata = [
  { key: "fullName", label: "Họ và tên", type: "string", requiredByCrm: true },
  { key: "phone", label: "Số điện thoại", type: "phone", requiredByCrm: true },
  { key: "email", label: "Email", type: "email", requiredByCrm: false },
  { key: "source", label: "Nguồn lead", type: "string", requiredByCrm: true },
  { key: "note", label: "Ghi chú", type: "string", requiredByCrm: false },
  { key: "companyName", label: "Công ty", type: "string", requiredByCrm: false },
  { key: "dateOfBirth", label: "Ngày sinh", type: "date", requiredByCrm: false },
  { key: "graduationYear", label: "Năm tốt nghiệp", type: "number", requiredByCrm: false },
  { key: "monthlyRevenue", label: "Doanh thu hàng tháng", type: "number", requiredByCrm: false },
  { key: "decisionSignedDate", label: "Ngày ký quyết định", type: "date", requiredByCrm: false },
  { key: "gclid", label: "Google Click ID", type: "string", requiredByCrm: false },
] as const;

export type WebhookCrmField = (typeof webhookFieldMetadata)[number]["key"];
export type WebhookFieldType = "string" | "number" | "boolean" | "date" | "datetime" | "email" | "phone";

export type WebhookMappingInput = {
  incomingKey: string;
  crmField: string;
  isRequired: boolean;
  defaultValue?: string | null;
};

export type WebhookInput = {
  name: string;
  targetModule: WebhookTargetModule;
  status: WebhookStatus;
  mappings: WebhookMappingInput[];
};

export type WebhookErrorCode =
  | "WEBHOOK_NOT_FOUND"
  | "WEBHOOK_DISABLED"
  | "INVALID_SECRET"
  | "INVALID_JSON"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_VALUE"
  | "RECORD_CREATE_FAILED"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE";

export type WebhookProcessResult =
  | { ok: true; status: 200; data: { record_id: string; request_id: string } }
  | { ok: false; status: number; error: { code: WebhookErrorCode; message: string; field?: string }; requestId?: string };
