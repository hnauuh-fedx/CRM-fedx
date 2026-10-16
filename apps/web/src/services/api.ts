import { readSelectedInstitutionProgramId } from "@/modules/institutions/institution-program-storage";
import { fetchWithSession } from "@/modules/auth/session-client";
import { ApiError } from "./api-error";
export { ApiError } from "./api-error";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const unauthorizedApiEvent = "admission-crm:api-unauthorized";

function notifyUnauthorizedRequest(response: Response, accessToken?: string | null) {
  if (response.status === 401 && accessToken) {
    window.dispatchEvent(new Event(unauthorizedApiEvent));
  }
}

function authorizedHeaders(accessToken?: string | null) {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
    const selectedProgramId = readSelectedInstitutionProgramId();
    if (selectedProgramId)
      headers.set("X-Institution-Program-Id", selectedProgramId);
  }
  return headers;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
    const selectedProgramId = readSelectedInstitutionProgramId();
    if (selectedProgramId && !headers.has("X-Institution-Program-Id")) {
      headers.set("X-Institution-Program-Id", selectedProgramId);
    }
  }

  const response = await fetchWithSession(`${apiUrl}${path}`, {
    ...init,
    headers,
  }, accessToken);

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok) {
    notifyUnauthorizedRequest(response, accessToken);
    throw new ApiError(
      payload.message ?? "Không thể kết nối đến máy chủ.",
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function apiFormRequest<T>(
  path: string,
  body: FormData,
  accessToken?: string | null,
): Promise<T> {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
    const selectedProgramId = readSelectedInstitutionProgramId();
    if (selectedProgramId && !headers.has("X-Institution-Program-Id")) {
      headers.set("X-Institution-Program-Id", selectedProgramId);
    }
  }

  const response = await fetchWithSession(`${apiUrl}${path}`, {
    method: "POST",
    headers,
    body,
  }, accessToken);
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok) {
    notifyUnauthorizedRequest(response, accessToken);
    throw new ApiError(
      payload.message ?? "Không thể kết nối đến máy chủ.",
      response.status,
    );
  }

  return payload as T;
}

export async function apiDownload(path: string, accessToken: string, init: RequestInit = {}) {
  const headers = authorizedHeaders(accessToken);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetchWithSession(`${apiUrl}${path}`, {
    ...init,
    headers,
  }, accessToken);
  if (!response.ok) {
    notifyUnauthorizedRequest(response, accessToken);
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new ApiError(
      payload.message ?? "Không thể tải tệp báo cáo.",
      response.status,
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileName =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "bao-cao-kpi";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
