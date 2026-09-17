import { env } from "../../../config/env";

const OA_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
const OA_INFO_URL = "https://openapi.zalo.me/v2.0/oa/getoa";
const OA_USER_DETAIL_URL = "https://openapi.zalo.me/v3.0/oa/user/detail";
const OA_CONVERSATION_URL = "https://openapi.zalo.me/v2.0/oa/conversation";

type ZaloErrorPayload = { error?: number; error_name?: string; error_description?: string; message?: string };

export class ZaloApiError extends Error {
  constructor(message: string, readonly code?: number, readonly status?: number) {
    super(message);
  }
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({})) as ZaloErrorPayload & Record<string, unknown>;
  if (!response.ok || (typeof payload.error === "number" && payload.error !== 0)) {
    throw new ZaloApiError(
      payload.error_description || payload.message || payload.error_name || `Zalo API trả về HTTP ${response.status}.`,
      payload.error,
      response.status,
    );
  }
  return payload;
}

export async function getZaloOaInfo(accessToken: string) {
  const response = await fetch(OA_INFO_URL, { headers: { access_token: accessToken } });
  const payload = await readJson(response) as { data?: { oaid?: string | number; oa_id?: string | number; name?: string } };
  const oaId = payload.data?.oaid ?? payload.data?.oa_id;
  if (!oaId) throw new ZaloApiError("Zalo không trả về OA ID.");
  return { oaId: String(oaId), oaName: payload.data?.name?.trim() || null };
}

export async function getZaloUserProfile(accessToken: string, userId: string) {
  try {
    const url = new URL(OA_USER_DETAIL_URL);
    url.searchParams.set("data", JSON.stringify({ user_id: userId }));
    const response = await fetch(url, { headers: { access_token: accessToken } });
    const payload = await readJson(response) as {
      data?: { user_id?: string | number; display_name?: string };
    };
    return {
      userId: String(payload.data?.user_id ?? userId),
      displayName: payload.data?.display_name?.trim() || null,
    };
  } catch (profileError) {
    const url = new URL(OA_CONVERSATION_URL);
    url.searchParams.set("data", JSON.stringify({ user_id: userId, offset: 0, count: 1 }));
    try {
      const response = await fetch(url, { headers: { access_token: accessToken } });
      const payload = await readJson(response) as {
        data?: Array<{
          from_id?: string | number;
          from_display_name?: string;
          to_id?: string | number;
          to_display_name?: string;
        }>;
      };
      const latestMessage = payload.data?.[0];
      const displayName = String(latestMessage?.from_id ?? "") === userId
        ? latestMessage?.from_display_name
        : String(latestMessage?.to_id ?? "") === userId
          ? latestMessage?.to_display_name
          : null;
      return { userId, displayName: displayName?.trim() || null };
    } catch {
      throw profileError;
    }
  }
}

export async function refreshZaloOaToken(refreshToken: string, appId: string) {
  if (!env.ZALO_APP_SECRET) throw new Error("ZALO_APP_SECRET chưa được cấu hình.");
  const body = new URLSearchParams({
    app_id: appId,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(OA_TOKEN_URL, {
    method: "POST",
    headers: {
      secret_key: env.ZALO_APP_SECRET,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await readJson(response) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number | string;
    refresh_token_expires_in?: number | string;
  };
  if (!payload.access_token || !payload.refresh_token) {
    throw new ZaloApiError("Zalo không trả về đầy đủ access token và refresh token mới.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: Math.max(60, Number(payload.expires_in) || 86_400),
    refreshTokenExpiresIn: payload.refresh_token_expires_in
      ? Math.max(60, Number(payload.refresh_token_expires_in))
      : null,
  };
}
