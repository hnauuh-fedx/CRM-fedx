import { createHash } from "node:crypto";

export function getAdmissionExpiryTargetDate(now: Date, addDays: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + addDays));
}

export function formatAdmissionExpiryDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getAdmissionExpiryExecutionId(ruleId: string, profileId: string, targetDate: Date) {
  const value = `admission-expiring:${ruleId}:${profileId}:${formatAdmissionExpiryDate(targetDate)}`;
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export function canRetryAdmissionExpiryExecution(existing: { status: string; nodeExecutionCount: number } | null) {
  return existing?.status === "failed" && existing.nodeExecutionCount === 0;
}
