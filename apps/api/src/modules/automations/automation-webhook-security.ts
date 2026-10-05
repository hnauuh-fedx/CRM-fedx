import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export const AUTOMATION_WEBHOOK_MAX_PAYLOAD_BYTES = 32 * 1024;

export function validateAutomationWebhookTarget(rawUrl: string, allowedHosts: string[]) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false as const, reason: "invalid_url" as const };
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const normalizedAllowedHosts = allowedHosts.map((host) => host.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (url.protocol !== "https:") return { ok: false as const, reason: "https_required" as const };
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || isIP(hostname) !== 0) {
    return { ok: false as const, reason: "private_target" as const };
  }
  if (!normalizedAllowedHosts.includes(hostname)) return { ok: false as const, reason: "host_not_allowed" as const };
  if (url.username || url.password) return { ok: false as const, reason: "credentials_not_allowed" as const };
  return { ok: true as const, url, hostname };
}

export function assertAutomationWebhookPayloadSize(payload: string) {
  if (Buffer.byteLength(payload, "utf8") > AUTOMATION_WEBHOOK_MAX_PAYLOAD_BYTES) {
    throw new Error("Payload webhook vượt quá giới hạn 32 KB.");
  }
}

export async function assertAutomationWebhookPublicDns(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error("Webhook hostname phân giải tới địa chỉ mạng nội bộ hoặc không hợp lệ.");
  }
  return addresses[0];
}

export function isPrivateNetworkAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateNetworkAddress(normalized.slice("::ffff:".length));
  if (isIP(normalized) !== 4) return false;
  const [first, second] = normalized.split(".").map(Number);
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first >= 224;
}
