import type {
  SaveZaloConnectionInput,
  ZaloConnection,
  ZaloConnectionListResponse,
  ZaloConnectionOptions,
  ZaloProcessingLogResponse,
} from "@/modules/marketing/zalo-integration.types";
import { apiRequest } from "./api";

export function getZaloConnections(accessToken: string) {
  return apiRequest<ZaloConnectionListResponse>("/integrations/zalo", {}, accessToken);
}

export function getZaloConnectionOptions(accessToken: string) {
  return apiRequest<ZaloConnectionOptions>("/integrations/zalo/options", {}, accessToken);
}

export function saveManualZaloConnection(input: SaveZaloConnectionInput, accessToken: string) {
  return apiRequest<ZaloConnection>("/integrations/zalo/manual", {
    method: "POST",
    body: JSON.stringify(input),
  }, accessToken);
}

export function testZaloConnection(id: string, accessToken: string) {
  return apiRequest<{ ok: boolean; oaId: string; oaName: string | null }>(`/integrations/zalo/${id}/test`, { method: "POST" }, accessToken);
}

export function refreshZaloConnection(id: string, accessToken: string) {
  return apiRequest<{ queued: boolean; message: string }>(`/integrations/zalo/${id}/refresh`, { method: "POST" }, accessToken);
}

export function disconnectZaloConnection(id: string, accessToken: string) {
  return apiRequest<ZaloConnection>(`/integrations/zalo/${id}`, { method: "DELETE" }, accessToken);
}

export function getZaloProcessingLogs(page: number, limit: number, accessToken: string) {
  return apiRequest<ZaloProcessingLogResponse>(`/integrations/zalo/logs?page=${page}&limit=${limit}`, {}, accessToken);
}
