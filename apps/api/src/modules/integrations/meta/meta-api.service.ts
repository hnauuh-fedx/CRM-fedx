import { env } from "../../../config/env";

type GraphError = { error?: { message?: string; code?: number; type?: string } };

export type MetaPageCandidate = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
};

function graphUrl(path: string) {
  return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`;
}

async function graphRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as T & GraphError;
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta Graph API trả về HTTP ${response.status}.`);
  }
  return payload;
}

export function buildMetaAuthorizationUrl(input: { redirectUri: string; state: string }) {
  if (!env.META_APP_ID) throw new Error("META_APP_ID chưa được cấu hình.");
  const query = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
    auth_type: "rerequest",
    scope: "pages_show_list,pages_manage_metadata,pages_messaging,pages_read_engagement",
  });
  return `https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth?${query}`;
}

export async function exchangeMetaAuthorizationCode(code: string, redirectUri: string) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new Error("Thông tin ứng dụng Meta chưa được cấu hình đầy đủ.");
  const query = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });
  const shortLived = await graphRequest<{ access_token: string }>(`${graphUrl("/oauth/access_token")}?${query}`);
  const longLivedQuery = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    fb_exchange_token: shortLived.access_token,
  });
  const longLived = await graphRequest<{ access_token: string }>(`${graphUrl("/oauth/access_token")}?${longLivedQuery}`);
  return longLived.access_token;
}

export async function getManagedMetaPages(userAccessToken: string) {
  const query = new URLSearchParams({ fields: "id,name,access_token,tasks", limit: "200" });
  const payload = await graphRequest<{ data?: MetaPageCandidate[] }>(`${graphUrl("/me/accounts")}?${query}`, {
    headers: { authorization: `Bearer ${userAccessToken}` },
  });
  if (payload.data?.length) return payload.data;

  if (!env.META_APP_ID || !env.META_APP_SECRET) return [];
  const appAccessToken = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
  const debugQuery = new URLSearchParams({ input_token: userAccessToken, access_token: appAccessToken });
  const debug = await graphRequest<{ data?: { granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> } }>(
    `https://graph.facebook.com/debug_token?${debugQuery}`,
  );
  const granularScopes = debug.data?.granular_scopes ?? [];
  const targetIds = [...new Set(granularScopes.flatMap((scope) => scope.target_ids ?? []))];
  const messagingTargetIds = new Set(
    granularScopes
      .filter((scope) => scope.scope === "pages_messaging")
      .flatMap((scope) => scope.target_ids ?? []),
  );
  const candidates = await Promise.allSettled(targetIds.map((pageId) => {
    const pageQuery = new URLSearchParams({ fields: "id,name,access_token" });
    return graphRequest<Omit<MetaPageCandidate, "tasks">>(`${graphUrl(`/${encodeURIComponent(pageId)}`)}?${pageQuery}`, {
      headers: { authorization: `Bearer ${userAccessToken}` },
    }).then((page) => ({ ...page, tasks: messagingTargetIds.has(page.id) ? ["MESSAGING"] : [] }));
  }));
  return candidates.flatMap((candidate) => candidate.status === "fulfilled" ? [candidate.value] : []);
}

export async function subscribeMetaPage(pageId: string, pageAccessToken: string) {
  const body = new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks" });
  const result = await graphRequest<{ success?: boolean }>(graphUrl(`/${encodeURIComponent(pageId)}/subscribed_apps`), {
    method: "POST",
    headers: { authorization: `Bearer ${pageAccessToken}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!result.success) throw new Error("Meta không xác nhận đăng ký webhook cho Page.");
}

export async function unsubscribeMetaPage(pageId: string, pageAccessToken: string) {
  await graphRequest<{ success?: boolean }>(graphUrl(`/${encodeURIComponent(pageId)}/subscribed_apps`), {
    method: "DELETE",
    headers: { authorization: `Bearer ${pageAccessToken}` },
  });
}

export async function getMetaPageInfo(pageId: string, pageAccessToken: string) {
  const query = new URLSearchParams({ fields: "id,name" });
  return graphRequest<{ id: string; name: string }>(`${graphUrl(`/${encodeURIComponent(pageId)}`)}?${query}`, {
    headers: { authorization: `Bearer ${pageAccessToken}` },
  });
}

export async function getMetaUserProfile(psid: string, pageAccessToken: string) {
  const query = new URLSearchParams({ fields: "id,name,first_name,last_name" });
  const profile = await graphRequest<{ id: string; name?: string; first_name?: string; last_name?: string }>(
    `${graphUrl(`/${encodeURIComponent(psid)}`)}?${query}`,
    { headers: { authorization: `Bearer ${pageAccessToken}` } },
  );
  const displayName = profile.name ?? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return { displayName: displayName || null };
}
