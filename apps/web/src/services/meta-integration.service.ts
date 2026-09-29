import type { MetaConnection, MetaConnectionListResponse, MetaConnectionOptions, MetaPageCandidate, MetaProcessingLogResponse } from "@/modules/marketing/meta-integration.types";
import { apiRequest } from "./api";

export const getMetaConnections = (token: string) => apiRequest<MetaConnectionListResponse>("/integrations/meta", {}, token);
export const getMetaConnectionOptions = (token: string) => apiRequest<MetaConnectionOptions>("/integrations/meta/options", {}, token);
export const getMetaProcessingLogs = (page: number, limit: number, token: string) => apiRequest<MetaProcessingLogResponse>(`/integrations/meta/logs?page=${page}&limit=${limit}`, {}, token);
export const startMetaOAuth = (input: { institutionProgramId: string; leadSourceId: string }, token: string) => apiRequest<{ authorizationUrl: string }>("/integrations/meta/oauth/start", { method: "POST", body: JSON.stringify(input) }, token);
export const getMetaOAuthPages = (sessionId: string, token: string) => apiRequest<{ data: MetaPageCandidate[] }>(`/integrations/meta/oauth/sessions/${sessionId}/pages`, {}, token);
export const connectMetaPage = (sessionId: string, pageId: string, token: string) => apiRequest<MetaConnection>(`/integrations/meta/oauth/sessions/${sessionId}/connect`, { method: "POST", body: JSON.stringify({ pageId }) }, token);
export const testMetaConnection = (id: string, token: string) => apiRequest<{ ok: boolean; connection: MetaConnection }>(`/integrations/meta/${id}/test`, { method: "POST" }, token);
export const disconnectMetaConnection = (id: string, token: string) => apiRequest<MetaConnection>(`/integrations/meta/${id}`, { method: "DELETE" }, token);
