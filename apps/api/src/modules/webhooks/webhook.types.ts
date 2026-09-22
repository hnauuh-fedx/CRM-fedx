export const webhookTargetModules = ["LEAD"] as const;
export const webhookStatuses = ["ACTIVE", "DISABLED"] as const;
export const webhookDuplicatePolicies = [
  "CREATE_NEW",
  "UPDATE_EXISTING",
  "REJECT",
] as const;

export type WebhookTargetModule = (typeof webhookTargetModules)[number];
export type WebhookStatus = (typeof webhookStatuses)[number];
export type WebhookDuplicatePolicy = (typeof webhookDuplicatePolicies)[number];

export const webhookFieldMetadata = [
  {
    key: "fullName",
    label: "Họ và tên",
    type: "string",
    requiredByCrm: true,
    group: "STANDARD",
  },
  {
    key: "phone",
    label: "Số điện thoại",
    type: "phone",
    requiredByCrm: true,
    group: "STANDARD",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "source",
    label: "Nguồn",
    type: "string",
    requiredByCrm: true,
    group: "STANDARD",
  },
  {
    key: "sourceGroupUrl",
    label: "URL xác định nhóm nguồn",
    type: "string",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "note",
    label: "Ghi chú",
    type: "string",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "companyName",
    label: "Công ty",
    type: "string",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "dateOfBirth",
    label: "Ngày sinh",
    type: "date",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "graduationYear",
    label: "Năm tốt nghiệp",
    type: "number",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "monthlyRevenue",
    label: "Doanh thu hàng tháng",
    type: "number",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "decisionSignedDate",
    label: "Ngày ký quyết định",
    type: "date",
    requiredByCrm: false,
    group: "STANDARD",
  },
  {
    key: "gclid",
    label: "Google Click ID",
    type: "string",
    requiredByCrm: false,
    group: "STANDARD",
  },
] as const;

export type WebhookCrmField = (typeof webhookFieldMetadata)[number]["key"];
export type WebhookFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "select"
  | "multi_select";

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
  duplicatePolicy: WebhookDuplicatePolicy;
  mappings: WebhookMappingInput[];
};

export type WebhookErrorCode =
  | "WEBHOOK_NOT_FOUND"
  | "WEBHOOK_DISABLED"
  | "INVALID_SECRET"
  | "INVALID_JSON"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_VALUE"
  | "DUPLICATE_RECORD"
  | "RECORD_CREATE_FAILED"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE";

export type WebhookProcessResult =
  | {
      ok: true;
      status: 200;
      data: {
        record_id: string;
        request_id: string;
        action: "created" | "updated";
      };
    }
  | {
      ok: false;
      status: number;
      error: {
        code: WebhookErrorCode;
        message: string;
        field?: string;
        duplicate_record_id?: string;
      };
      requestId?: string;
    };
