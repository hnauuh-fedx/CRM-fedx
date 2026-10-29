import { apiFormRequest, apiRequest } from "./api";

export type FileCapabilities = { uploadEnabled: boolean; maxBytes: number; allowedTypes: string[] };
export function getFileCapabilities(token: string) { return apiRequest<FileCapabilities>("/files/capabilities", {}, token); }
export function uploadPrivateFile(leadId: string, file: File, requestId: string, token: string, documentType?: string) {
  const form = new FormData(); form.append("file", file);
  const path = documentType ? `/admissions/${leadId}/files/upload?documentType=${encodeURIComponent(documentType)}` : `/leads/${leadId}/files/upload`;
  return apiFormRequest<{ id: string }>(path, form, token, { "X-Request-Id": requestId });
}
export function getPrivateFileDownload(id: string, token: string) { return apiRequest<{ url: string; expiresIn: number }>(`/files/${id}/download-url`, { method: "POST" }, token); }
