import { createHash } from "node:crypto";

export type AutomationMessageChannel = "email" | "sms" | "zns";
export type AutomationConsentStatus = "consented" | "opted_out" | "unknown";

export function normalizeDestination(channel: AutomationMessageChannel, value: string) {
  const trimmed = value.trim();
  return channel === "email" ? trimmed.toLocaleLowerCase() : trimmed.replace(/[^+\d]/g, "");
}

export function hashDestination(channel: AutomationMessageChannel, value: string) {
  return createHash("sha256").update(`${channel}:${normalizeDestination(channel, value)}`).digest("hex");
}

export function maskDestination(channel: AutomationMessageChannel, value: string) {
  const normalized = normalizeDestination(channel, value);
  if (channel === "email") {
    const [name = "", domain = ""] = normalized.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return normalized.length <= 4 ? "****" : `${"*".repeat(Math.min(8, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function getSuppressionReason(input: {
  consentStatus: AutomationConsentStatus;
  consentPolicy: "require_consent" | "allow_unknown";
  isSuppressed: boolean;
}) {
  if (input.isSuppressed) return "suppression_list" as const;
  if (input.consentStatus === "opted_out") return "opted_out" as const;
  if (input.consentPolicy === "require_consent" && input.consentStatus !== "consented") return "consent_required" as const;
  return null;
}
