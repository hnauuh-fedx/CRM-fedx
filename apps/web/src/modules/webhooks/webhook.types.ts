export type WebhookStatus = "ACTIVE" | "DISABLED";
export type WebhookDuplicatePolicy =
  | "CREATE_NEW"
  | "UPDATE_EXISTING"
  | "REJECT";
export type WebhookAction = "CREATED" | "UPDATED" | "REJECTED" | "FAILED";
export type WebhookRequestStatus =
  | "RECEIVED"
  | "QUEUED"
  | "PROCESSING"
  | "RETRYING"
  | "SUCCEEDED"
  | "FAILED"
  | "DEAD_LETTER"
  | "QUEUE_FAILED";

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
  status: WebhookRequestStatus;
  action: WebhookAction;
  responseCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  recordId: string | null;
  duplicateRecordId: string | null;
  processingTimeMs: number;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  receivedAt: string;
  processedAt: string | null;
};

export type WebhookLogDetail = WebhookLog & {
  payload: unknown;
  mappedPayload: unknown;
  totalAttemptCount: number;
  processingStartedAt: string | null;
  completedAt: string | null;
  deadLetteredAt: string | null;
  reprocessedCount: number;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    errorCategory: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
  }>;
};
