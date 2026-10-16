import type { AuthSession, LoginInput } from "../../types/auth";
import { ApiError } from "../../services/api-error";
import { readSelectedInstitutionProgramId, storeSelectedInstitutionProgramId } from "../institutions/institution-program-storage";
import { clearLegacyAccessTokens } from "./auth-storage";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
export const sessionChangedEvent = "admission-crm:session-changed";
export const sessionRequiredEvent = "admission-crm:session-required";
const syncKey = "admission-crm.auth-event";
let session: AuthSession | null = null;
let validUntil = 0;
let suspended = false;
let generation = 0;
let refreshPromise: Promise<AuthSession> | null = null;
const acceptedTokens = new Set<string>();

export function currentSession() { return session; }

function emitSession() { window.dispatchEvent(new Event(sessionChangedEvent)); }

export function forgetSession() {
  generation += 1;
  session = null;
  validUntil = 0;
  suspended = false;
  acceptedTokens.clear();
  // Remove credentials written by the previous authentication implementation.
  clearLegacyAccessTokens();
  emitSession();
}

function acceptSession(next: AuthSession) {
  if (session?.user.id !== next.user.id) acceptedTokens.clear();
  acceptedTokens.add(next.accessToken);
  if (acceptedTokens.size > 64) acceptedTokens.delete(acceptedTokens.values().next().value!);
  const storedProgramId = readSelectedInstitutionProgramId();
  if (!next.user.institutionProgramIds.includes(storedProgramId ?? "") && next.user.workingInstitutionProgramId) {
    storeSelectedInstitutionProgramId(next.user.workingInstitutionProgramId);
  }
  session = next;
  validUntil = Date.now() + next.expiresIn * 1000;
  suspended = false;
  emitSession();
  return next;
}

export function requireSession() {
  if (session && !suspended) {
    suspended = true;
    window.dispatchEvent(new Event(sessionRequiredEvent));
  }
}

// No credentials are sent through Web Storage. Other tabs discard their old
// identity/cache after login or logout instead of inheriting a different user.
function broadcastSessionChange() {
  localStorage.setItem(syncKey, JSON.stringify({ id: crypto.randomUUID(), at: Date.now() }));
}

export function subscribeToOtherTabs(listener: () => void) {
  const handle = (event: StorageEvent) => {
    if (event.key === syncKey && event.newValue) { forgetSession(); listener(); }
  };
  window.addEventListener("storage", handle);
  return () => window.removeEventListener("storage", handle);
}

async function withAuthLock<T>(run: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request("admission-crm:auth", run) : run();
}

async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}/auth/${path}`, {
    method: "POST", credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", "X-CRM-Auth": "1", ...(readSelectedInstitutionProgramId() ? { "X-Institution-Program-Id": readSelectedInstitutionProgramId()! } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.message ?? "Không thể xác thực lúc này. Vui lòng thử lại.", response.status);
  }
  return response.json() as Promise<T>;
}

export function refreshSession(): Promise<AuthSession> {
  if (refreshPromise) return refreshPromise;
  const startedGeneration = generation;
  refreshPromise = withAuthLock(async () => {
    if (startedGeneration !== generation) throw new ApiError("Phiên đăng nhập đã thay đổi.", 401);
    try {
      const next = await authRequest<AuthSession>("refresh");
      if (startedGeneration !== generation) throw new ApiError("Phiên đăng nhập đã thay đổi.", 401);
      if (session && session.user.id !== next.user.id) {
        forgetSession();
        throw new ApiError("Tài khoản đã thay đổi. Vui lòng mở lại trang.", 401);
      }
      return acceptSession(next);
    } catch (error) {
      if (startedGeneration === generation && error instanceof ApiError && error.status === 401) requireSession();
      throw error;
    }
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function signInSession(input: LoginInput) {
  return withAuthLock(async () => {
    const next = await authRequest<AuthSession>("login", input);
    generation += 1;
    acceptSession(next);
    broadcastSessionChange();
    return next;
  });
}

export async function signOutSession(all = false) {
  await withAuthLock(async () => {
    await authRequest(all ? "logout-all" : "logout");
    forgetSession();
    broadcastSessionChange();
  });
}

export async function validAccessToken(fallback: string) {
  if (suspended) throw new ApiError("Vui lòng đăng nhập lại để tiếp tục.", 401);
  if (!session) return fallback;
  if (!acceptedTokens.has(fallback)) throw new ApiError("Thao tác thuộc phiên đăng nhập trước. Vui lòng thực hiện lại.", 409);
  if (Date.now() >= validUntil - 30_000) return (await refreshSession()).accessToken;
  return session.accessToken;
}

export async function fetchWithSession(url: string, init: RequestInit, accessToken?: string | null) {
  if (!accessToken) return fetch(url, init);
  const startedGeneration = generation;
  const headers = new Headers(init.headers);
  const token = await validAccessToken(accessToken);
  const assertSameIdentity = () => {
    if (startedGeneration !== generation) throw new ApiError("Phiên đăng nhập đã thay đổi. Vui lòng thử lại.", 409);
  };
  assertSameIdentity();
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  assertSameIdentity();
  if (response.status !== 401) return response;
  // Authentication middleware rejects before executing a business mutation.
  // Refresh credentials, but replay only safe reads; the caller retries writes.
  if (!session || token === session.accessToken) {
    await refreshSession();
  }
  assertSameIdentity();
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new ApiError("Phiên đã được gia hạn. Vui lòng thực hiện lại thao tác; nội dung đang nhập vẫn được giữ.", 409);
  }
  if (!session) throw new ApiError("Vui lòng đăng nhập lại.", 401);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  const retried = await fetch(url, { ...init, headers });
  assertSameIdentity();
  if (retried.status === 401) requireSession();
  return retried;
}
