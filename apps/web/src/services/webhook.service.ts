import type {
  WebhookCreateResult,
  WebhookDetail,
  WebhookField,
  WebhookInput,
  WebhookLog,
  WebhookLogDetail,
  WebhookStatus,
  WebhookSummary,
} from "@/modules/webhooks/webhook.types";
import { apiRequest } from "./api";

type Paginated<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export function getAbsoluteWebhookUrl(relativePath: string) {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  return new URL(relativePath.replace(/^\/api\//, ""), base).toString();
}

export function getWebhookMetadata(accessToken: string) {
  return apiRequest<{
    targetModules: Array<{ value: "LEAD"; label: string }>;
    fields: WebhookField[];
  }>("/settings/webhooks/metadata", {}, accessToken);
}

export function getWebhooks(page: number, accessToken: string) {
  return apiRequest<Paginated<WebhookSummary>>(
    `/settings/webhooks?page=${page}&limit=20`,
    {},
    accessToken,
  );
}

export function getWebhook(id: string, accessToken: string) {
  return apiRequest<WebhookDetail>(`/settings/webhooks/${id}`, {}, accessToken);
}

export function createWebhook(input: WebhookInput, accessToken: string) {
  return apiRequest<WebhookCreateResult>(
    "/settings/webhooks",
    { method: "POST", body: JSON.stringify(input) },
    accessToken,
  );
}

export function updateWebhook(
  id: string,
  input: WebhookInput,
  accessToken: string,
) {
  return apiRequest<WebhookDetail>(
    `/settings/webhooks/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    accessToken,
  );
}

export function updateWebhookStatus(
  id: string,
  status: WebhookStatus,
  accessToken: string,
) {
  return apiRequest<{ id: string; status: WebhookStatus }>(
    `/settings/webhooks/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    accessToken,
  );
}

export function deleteWebhook(id: string, accessToken: string) {
  return apiRequest<{ id: string }>(
    `/settings/webhooks/${id}`,
    { method: "DELETE" },
    accessToken,
  );
}

export function regenerateWebhookSecret(id: string, accessToken: string) {
  return apiRequest<{ secret: string }>(
    `/settings/webhooks/${id}/regenerate-secret`,
    { method: "POST" },
    accessToken,
  );
}

export function getWebhookLogs(id: string, page: number, accessToken: string) {
  return apiRequest<Paginated<WebhookLog>>(
    `/settings/webhooks/${id}/logs?page=${page}&limit=20`,
    {},
    accessToken,
  );
}

export function getWebhookLog(id: string, logId: string, accessToken: string) {
  return apiRequest<WebhookLogDetail>(
    `/settings/webhooks/${id}/logs/${logId}`,
    {},
    accessToken,
  );
}

export function testWebhook(
  id: string,
  payload: Record<string, unknown>,
  accessToken: string,
) {
  return apiRequest<{
    success: true;
    data: {
      record_id?: string;
      request_id: string;
      action: "created" | "updated";
    };
  }>(
    `/settings/webhooks/${id}/test`,
    { method: "POST", body: JSON.stringify({ payload }) },
    accessToken,
  );
}
