export type WebhookStatus = "ACTIVE" | "DISABLED";
export type WebhookDuplicatePolicy =
  | "CREATE_NEW"
  | "UPDATE_EXISTING"
  | "REJECT";
export type WebhookAction = "CREATED" | "UPDATED" | "REJECTED" | "FAILED";

export type WebhookMapping = {
  id?: string;
  incomingKey: string;
  crmField: string;
  isRequired: boolean;
  defaultValue: string | null;
};

export type WebhookSummary = {
  id: string;
  name: string;
  targetModule: "LEAD";
  webhookKey: string;
  webhookUrl: string;
  status: WebhookStatus;
  duplicatePolicy: WebhookDuplicatePolicy;
  lastReceivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDetail = WebhookSummary & { mappings: WebhookMapping[] };
export type WebhookCreateResult = WebhookDetail & { secret: string };

export type WebhookInput = {
  name: string;
  targetModule: "LEAD";
  status: WebhookStatus;
  duplicatePolicy: WebhookDuplicatePolicy;
  mappings: Array<Omit<WebhookMapping, "id">>;
};

export type WebhookField = {
  key: string;
  label: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "email"
    | "phone";
  requiredByCrm: boolean;
  group: "STANDARD" | "CUSTOM";
  customFieldId?: string;
  options?: string[];
};

export type WebhookLog = {
  id: string;
  requestId: string;
  status: "SUCCESS" | "FAILED";
  action: WebhookAction;
  responseCode: number;
  errorCode: string | null;
  errorMessage: string | null;
  recordId: string | null;
  duplicateRecordId: string | null;
  processingTimeMs: number;
  receivedAt: string;
  processedAt: string;
};

export type WebhookLogDetail = WebhookLog & {
  payload: unknown;
  mappedPayload: unknown;
};
