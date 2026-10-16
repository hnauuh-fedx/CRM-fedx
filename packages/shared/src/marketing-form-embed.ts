export const marketingFormEmbedProtocol = "admission-crm.form-embed" as const;
export const marketingFormEmbedVersion = 1 as const;

export const marketingFormTrackingKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "source_url",
  "source_referrer",
] as const;

export type MarketingFormTrackingKey = (typeof marketingFormTrackingKeys)[number];
export type MarketingFormTracking = Partial<Record<MarketingFormTrackingKey, string>>;
export type MarketingFormRedirectMode = "form" | "landing_page";

export type MarketingFormEmbedMessage =
  | { protocol: typeof marketingFormEmbedProtocol; version: typeof marketingFormEmbedVersion; type: "ready"; formId: string }
  | { protocol: typeof marketingFormEmbedProtocol; version: typeof marketingFormEmbedVersion; type: "resize"; formId: string; height: number }
  | { protocol: typeof marketingFormEmbedProtocol; version: typeof marketingFormEmbedVersion; type: "tracking"; formId: string; tracking: MarketingFormTracking }
  | { protocol: typeof marketingFormEmbedProtocol; version: typeof marketingFormEmbedVersion; type: "redirect"; formId: string; url: string };

type EmbedPayloads = {
  ready: Record<string, never>;
  resize: { height: number };
  tracking: { tracking: MarketingFormTracking };
  redirect: { url: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safeHttpUrl(value: string, base?: string) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function sanitizeSourceUrl(key: "source_url" | "source_referrer", value: string) {
  const url = safeHttpUrl(value);
  if (!url) return null;
  url.hash = "";
  if (key === "source_referrer") {
    url.search = "";
  } else {
    for (const parameter of [...url.searchParams.keys()]) {
      if (!parameter.startsWith("utm_") || !marketingFormTrackingKeys.includes(parameter as MarketingFormTrackingKey)) {
        url.searchParams.delete(parameter);
      }
    }
  }
  const sanitized = url.toString();
  return sanitized.length <= 1_000 ? sanitized : null;
}

export function sanitizeMarketingFormTracking(value: unknown): MarketingFormTracking {
  if (!isRecord(value)) return {};
  const tracking: MarketingFormTracking = {};
  for (const key of marketingFormTrackingKeys) {
    const raw = value[key];
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    const maxLength = key.startsWith("source_") ? 1_000 : 200;
    if (!text || text.length > maxLength) continue;
    if (key === "source_url" || key === "source_referrer") {
      const sanitized = sanitizeSourceUrl(key, text);
      if (sanitized) tracking[key] = sanitized;
      continue;
    }
    tracking[key] = text;
  }
  return tracking;
}

export function createMarketingFormEmbedMessage<T extends keyof EmbedPayloads>(
  type: T,
  formId: string,
  payload: EmbedPayloads[T],
): Extract<MarketingFormEmbedMessage, { type: T }> {
  return {
    protocol: marketingFormEmbedProtocol,
    version: marketingFormEmbedVersion,
    type,
    formId,
    ...payload,
  } as unknown as Extract<MarketingFormEmbedMessage, { type: T }>;
}

export function parseMarketingFormEmbedMessage(value: unknown, expectedFormId: string): MarketingFormEmbedMessage | null {
  if (!isRecord(value) || value.protocol !== marketingFormEmbedProtocol || value.version !== marketingFormEmbedVersion || value.formId !== expectedFormId) return null;
  const baseKeys = ["protocol", "version", "type", "formId"];
  if (value.type === "ready" && hasExactKeys(value, baseKeys)) return createMarketingFormEmbedMessage("ready", expectedFormId, {});
  if (value.type === "resize" && hasExactKeys(value, [...baseKeys, "height"]) && Number.isInteger(value.height) && Number(value.height) >= 240 && Number(value.height) <= 4_000) {
    return createMarketingFormEmbedMessage("resize", expectedFormId, { height: Number(value.height) });
  }
  if (value.type === "tracking" && hasExactKeys(value, [...baseKeys, "tracking"])) {
    const tracking = sanitizeMarketingFormTracking(value.tracking);
    if (!isRecord(value.tracking) || Object.keys(tracking).length !== Object.keys(value.tracking).length) return null;
    return createMarketingFormEmbedMessage("tracking", expectedFormId, { tracking });
  }
  if (value.type === "redirect" && hasExactKeys(value, [...baseKeys, "url"]) && typeof value.url === "string" && value.url.length <= 2_048 && safeHttpUrl(value.url)) {
    return createMarketingFormEmbedMessage("redirect", expectedFormId, { url: value.url });
  }
  return null;
}

export function resolveMarketingFormRedirect(settings: unknown, applicationOrigin: string): { mode: MarketingFormRedirectMode; url: string } | null {
  if (!isRecord(settings) || typeof settings.redirectUrl !== "string" || !settings.redirectUrl.trim()) return null;
  const mode = settings.redirectMode === "landing_page" ? "landing_page" : settings.redirectMode === "form" || settings.redirectMode === undefined ? "form" : null;
  if (!mode) return null;
  const application = safeHttpUrl(applicationOrigin);
  if (!application) return null;
  const localApplication = ["localhost", "127.0.0.1", "[::1]"].includes(application.hostname);
  if (application.protocol !== "https:" && !localApplication) return null;
  const target = safeHttpUrl(settings.redirectUrl.trim(), application.origin);
  if (!target) return null;
  const allowedOrigins = Array.isArray(settings.redirectAllowedOrigins)
    ? settings.redirectAllowedOrigins.flatMap((item) => {
      if (typeof item !== "string") return [];
      const candidate = safeHttpUrl(item.trim());
      return candidate && candidate.protocol === "https:" && candidate.origin === item.trim() ? [candidate.origin] : [];
    })
    : [];
  if (target.origin !== application.origin && (target.protocol !== "https:" || !allowedOrigins.includes(target.origin))) return null;
  return { mode, url: target.toString() };
}
