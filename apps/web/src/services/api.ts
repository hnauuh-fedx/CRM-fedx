import { readSelectedInstitutionProgramId } from "@/modules/institutions/institution-program-storage";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

function authorizedHeaders(accessToken?: string | null) {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
    const selectedProgramId = readSelectedInstitutionProgramId();
    if (selectedProgramId) headers.set("X-Institution-Program-Id", selectedProgramId);
  }
  return headers;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
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

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(payload.message ?? "Không thể kết nối đến máy chủ.", response.status);
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

  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers,
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new ApiError(payload.message ?? "Không thể kết nối đến máy chủ.", response.status);
  }

  return payload as T;
}

export async function apiDownload(path: string, accessToken: string) {
  const response = await fetch(`${apiUrl}${path}`, { headers: authorizedHeaders(accessToken) });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(payload.message ?? "Không thể tải tệp báo cáo.", response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "bao-cao-kpi";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
