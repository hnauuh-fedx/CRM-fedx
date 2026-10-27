import type { PreferenceSection, PreferenceSnapshot, SystemPreferences } from "@admission-crm/shared/system-preferences";
import { apiRequest } from "./api";

export function getSystemPreferences(token: string, programId: string) {
  return apiRequest<{ institutionProgramId: string; sections: PreferenceSnapshot[] }>("/system/preferences", { headers: { "X-Institution-Program-Id": programId } }, token);
}
export function saveSystemPreference(token: string, programId: string, section: PreferenceSection, value: unknown, revision: string) {
  return apiRequest<PreferenceSnapshot>(`/system/preferences/${section}`, { method: "PUT", headers: { "X-Institution-Program-Id": programId }, body: JSON.stringify({ value, revision }) }, token);
}
export type PreferenceHistoryEntry = { id: string; createdAt: string | null; actor: string; previousValue: unknown };
export function getSystemPreferenceHistory(token: string, programId: string, section: PreferenceSection, page: number) {
  return apiRequest<{ data: PreferenceHistoryEntry[]; page: number; hasMore: boolean }>(`/system/preferences/${section}/history?page=${page}`, { headers: { "X-Institution-Program-Id": programId } }, token);
}
export function simulateSystemPreferences(token: string, programId: string, preferences: SystemPreferences, source: "excel" | "bizfly" | "inbound", duplicate: boolean) {
  return apiRequest<{ action: string; assignment: string; blankValues: string }>("/system/preferences/simulate", { method: "POST", headers: { "X-Institution-Program-Id": programId }, body: JSON.stringify({ preferences, source, duplicate }) }, token);
}
export type LeadFormConfiguration = { requirements: Record<string, boolean>; revision: string };
export function getLeadFormConfiguration(token: string) { return apiRequest<LeadFormConfiguration>("/system/lead-form", {}, token); }
export function saveLeadFormConfiguration(token: string, value: LeadFormConfiguration) { return apiRequest<LeadFormConfiguration>("/system/lead-form", { method: "PUT", body: JSON.stringify(value) }, token); }
