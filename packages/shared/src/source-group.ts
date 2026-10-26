import { z } from "zod/v4";

export const sourceGroupCodes = ["facebook", "google", "tiktok", "zalo", "instagram", "youtube", "website", "other"] as const;
export type SourceGroupCode = (typeof sourceGroupCodes)[number];
export const sourceGroupLabels: Record<SourceGroupCode, string> = {
  facebook: "Facebook", google: "Google", tiktok: "TikTok", zalo: "Zalo",
  instagram: "Instagram", youtube: "YouTube", website: "Website", other: "Khác",
};
export const sourceGroupSettingSchema = z.enum(["auto", ...sourceGroupCodes], { error: "Vui lòng chọn nhóm nguồn trong danh mục." }).nullish();
export const sourceGroupSettingsSchema = z.object({ sourceGroup: sourceGroupSettingSchema }).catchall(z.unknown());

const aliases: Record<string, SourceGroupCode> = {};
const aliasGroups: Record<SourceGroupCode, string[]> = {
  facebook: ["facebook", "fb", "facebook_ads", "fb_ads", "meta", "meta_ads"],
  google: ["google", "google_ads", "googleads", "adwords", "gads"],
  tiktok: ["tiktok", "tik_tok", "tiktok_ads", "tt", "tt_ads"],
  zalo: ["zalo", "zalo_ads", "zalo_oa"],
  instagram: ["instagram", "ig", "instagram_ads", "ig_ads"],
  youtube: ["youtube", "yt", "youtube_ads"],
  website: ["website", "web", "site"],
  other: ["other", "khác", "khac"],
};
for (const code of sourceGroupCodes) for (const alias of aliasGroups[code]) aliases[alias] = code;
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function fromUtm(value: unknown): SourceGroupCode | undefined {
  const normalized = text(value).toLowerCase().replace(/[\s.-]+/g, "_");
  return Object.prototype.hasOwnProperty.call(aliases, normalized) ? aliases[normalized] : undefined;
}
function httpUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}
const referrerDomains: Array<[SourceGroupCode, string[]]> = [
  ["facebook", ["facebook.com", "fb.com", "fb.me"]],
  ["google", ["google.com", "google.com.vn", "googleadservices.com", "googlesyndication.com"]],
  ["tiktok", ["tiktok.com"]], ["zalo", ["zalo.me", "zalo.vn"]],
  ["instagram", ["instagram.com"]], ["youtube", ["youtube.com", "youtu.be"]],
];
export type SourceGroupInput = { fixedGroup?: unknown; utmSource?: unknown; sourceUrl?: unknown; referrer?: unknown };
/** Attribution only uses configured groups or tracking, never a form/webhook name. */
export function resolveSourceGroup(input: SourceGroupInput): { code: SourceGroupCode; name: string; matchedBy: "configured" | "utm_source" | "referrer" | "fallback" } {
  const fixed = sourceGroupSettingSchema.safeParse(input.fixedGroup);
  if (fixed.success && fixed.data && fixed.data !== "auto") return { code: fixed.data, name: sourceGroupLabels[fixed.data], matchedBy: "configured" };
  const url = httpUrl(input.sourceUrl);
  const utm = fromUtm(input.utmSource) ?? fromUtm(url?.searchParams.get("utm_source"));
  if (utm) return { code: utm, name: sourceGroupLabels[utm], matchedBy: "utm_source" };
  const hostname = httpUrl(input.referrer)?.hostname.toLowerCase().replace(/\.$/, "");
  const referrer = hostname ? referrerDomains.find(([, domains]) => domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`)))?.[0] : undefined;
  if (referrer) return { code: referrer, name: sourceGroupLabels[referrer], matchedBy: "referrer" };
  return { code: "other", name: sourceGroupLabels.other, matchedBy: "fallback" };
}
