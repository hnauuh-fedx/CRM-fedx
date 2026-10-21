import { env } from "../../../config/env";

type TikTokEnvelope<T> = { code: number; message: string; request_id?: string; data?: T };

export class TikTokApiError extends Error {
  constructor(message: string, readonly code: number | null, readonly requestId?: string) {
    super(message);
  }
}

export type TikTokLeadForm = {
  page_id: string;
  title?: string;
  status?: string;
  create_time?: string;
  update_time?: string;
};

export type TikTokMockLead = {
  lead_id?: string;
  page_id?: string;
  create_time?: string;
  field_data?: Array<{ name?: string; value?: string }>;
  [key: string]: unknown;
};

type TikTokPageInfo = { page: number; page_size: number; total_number: number; total_page: number };

function requireTikTokCredentials() {
  if (!env.TIKTOK_ACCESS_TOKEN) throw new TikTokApiError("TIKTOK_ACCESS_TOKEN chưa được cấu hình.", null);
  if (!env.TIKTOK_ADVERTISER_ID) throw new TikTokApiError("TIKTOK_ADVERTISER_ID chưa được cấu hình.", null);
  return { accessToken: env.TIKTOK_ACCESS_TOKEN, advertiserId: env.TIKTOK_ADVERTISER_ID };
}

export function isTikTokSandbox() {
  return env.TIKTOK_API_BASE.includes("sandbox-ads.tiktok.com");
}

async function tiktokRequest<T>(path: string, init: { method?: "GET" | "POST"; query?: Record<string, unknown>; body?: unknown } = {}) {
  const { accessToken } = requireTikTokCredentials();
  const url = new URL(`${env.TIKTOK_API_BASE.replace(/\/+$/, "")}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as TikTokEnvelope<T> | null;
  if (!response.ok || !payload) {
    const hint = response.status === 404 && isTikTokSandbox() ? " Endpoint này không có trên môi trường sandbox." : "";
    throw new TikTokApiError(`TikTok API trả về HTTP ${response.status}.${hint}`, null);
  }
  // TikTok Business API returns HTTP 200 with a non-zero `code` on business errors.
  if (payload.code !== 0) {
    throw new TikTokApiError(payload.message || `TikTok API trả về lỗi (code ${payload.code}).`, payload.code, payload.request_id);
  }
  return payload.data as T;
}

export async function listTikTokLeadForms(page: number, pageSize: number) {
  const { advertiserId } = requireTikTokCredentials();
  const data = await tiktokRequest<{ list?: TikTokLeadForm[]; page_info?: TikTokPageInfo }>("/page/get/", {
    query: { advertiser_id: advertiserId, business_type: "LEAD_GEN", page: String(page), page_size: String(pageSize) },
  });
  return { items: data.list ?? [], pageInfo: data.page_info ?? { page, page_size: pageSize, total_number: 0, total_page: 0 } };
}

export async function createTikTokMockLead(pageId: string) {
  const { advertiserId } = requireTikTokCredentials();
  return tiktokRequest<TikTokMockLead>("/page/lead/mock/create/", {
    method: "POST",
    body: { advertiser_id: advertiserId, page_id: pageId },
  });
}

export async function getTikTokMockLead(pageId: string) {
  const { advertiserId } = requireTikTokCredentials();
  return tiktokRequest<TikTokMockLead>("/page/lead/mock/get/", {
    query: { advertiser_id: advertiserId, page_id: pageId },
  });
}

export async function deleteTikTokMockLead(leadId: string) {
  const { advertiserId } = requireTikTokCredentials();
  return tiktokRequest<unknown>("/page/lead/mock/delete/", {
    method: "POST",
    body: { advertiser_id: advertiserId, lead_id: leadId },
  });
}

export type TikTokSubscription = {
  subscription_id: string;
  subscribe_entity?: string;
  callback_url?: string;
  subscription_detail?: { advertiser_id?: string; page_id?: string; lead_source?: string };
};

function requireTikTokApp() {
  if (isTikTokSandbox()) {
    throw new TikTokApiError("Sandbox không hỗ trợ đăng ký webhook. Hãy đổi TIKTOK_API_BASE, TIKTOK_ACCESS_TOKEN và TIKTOK_ADVERTISER_ID sang production.", 40008);
  }
  if (!env.TIKTOK_APP_ID || !env.TIKTOK_SECRET) throw new TikTokApiError("TIKTOK_APP_ID hoặc TIKTOK_SECRET chưa được cấu hình.", null);
  return { appId: env.TIKTOK_APP_ID, secret: env.TIKTOK_SECRET };
}

/** Subscribes the app to new Instant Form leads; TikTok then POSTs each lead to `callbackUrl`. */
export async function subscribeTikTokLeads(callbackUrl: string, pageId?: string) {
  const { appId, secret } = requireTikTokApp();
  const { accessToken, advertiserId } = requireTikTokCredentials();
  return tiktokRequest<{ subscription_id: string }>("/subscription/subscribe/", {
    method: "POST",
    body: {
      app_id: appId,
      secret,
      subscribe_entity: "LEAD",
      callback_url: callbackUrl,
      subscription_detail: { access_token: accessToken, advertiser_id: advertiserId, lead_source: "INSTANT_FORM", page_id: pageId },
    },
  });
}

export async function listTikTokLeadSubscriptions() {
  const { appId, secret } = requireTikTokApp();
  const data = await tiktokRequest<{ subscriptions?: TikTokSubscription[]; list?: TikTokSubscription[] }>("/subscription/get/", {
    query: { app_id: appId, secret, subscribe_entity: "LEAD", page: "1", page_size: "50" },
  });
  // Never echo the access token TikTok stores in subscription_detail.
  return (data.subscriptions ?? data.list ?? []).map((item) => ({
    subscription_id: item.subscription_id,
    callback_url: item.callback_url,
    advertiser_id: item.subscription_detail?.advertiser_id,
    page_id: item.subscription_detail?.page_id,
    lead_source: item.subscription_detail?.lead_source,
  }));
}

export async function unsubscribeTikTokLeads(subscriptionId: string) {
  const { appId, secret } = requireTikTokApp();
  return tiktokRequest<unknown>("/subscription/unsubscribe/", {
    method: "POST",
    body: { app_id: appId, secret, subscription_id: subscriptionId },
  });
}
