import type { ExportSettingInput, SettingInput, SlaRuleInput, SystemDashboard } from "@/modules/management/system-management.types";
import { apiRequest } from "./api";

export function getSystemManagementDashboard(accessToken: string) {
  return apiRequest<SystemDashboard>("/system", {}, accessToken);
}

export function upsertSystemSetting(input: SettingInput, accessToken: string) {
  return apiRequest<{ id: string }>("/system/settings", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function deleteSystemSetting(id: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/system/settings/${id}`, { method: "DELETE" }, accessToken);
}

export function createSlaRule(input: SlaRuleInput, accessToken: string) {
  return apiRequest<{ id: string }>("/system/sla-rules", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateSlaRule(id: string, input: SlaRuleInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/system/sla-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteSlaRule(id: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/system/sla-rules/${id}`, { method: "DELETE" }, accessToken);
}

export function createExportSetting(input: ExportSettingInput, accessToken: string) {
  return apiRequest<{ id: string }>("/system/export-settings", { method: "POST", body: JSON.stringify(input) }, accessToken);
}

export function updateExportSetting(id: string, input: ExportSettingInput, accessToken: string) {
  return apiRequest<{ id: string }>(`/system/export-settings/${id}`, { method: "PATCH", body: JSON.stringify(input) }, accessToken);
}

export function deleteExportSetting(id: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/system/export-settings/${id}`, { method: "DELETE" }, accessToken);
}
