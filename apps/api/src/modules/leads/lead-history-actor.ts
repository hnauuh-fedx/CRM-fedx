import { recordObject } from "./lead-creation-history";

/** Only use explicit execution provenance or unambiguous legacy event types. */
export function leadHistoryActorLabel(kind: string, data: unknown, content?: string | null): string | undefined {
  const source = recordObject(recordObject(data).executionSource);
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (source.channel === "automation") return name ? "Hệ thống · Automation: " + name : "Hệ thống · Automation";
  if (source.channel === "webhook" || source.channel === "api") return name ? "API / Webhook · " + name : "API / Webhook";
  if (source.channel === "public_form") return name ? "Biểu mẫu hệ thống · " + name : "Biểu mẫu hệ thống";
  if (kind.startsWith("automation_")) return "Hệ thống · Automation";
  if (kind === "webhook_update" ||
      (kind === "lead_updated" && content === "Cập nhật Lead từ inbound webhook.")) return "API / Webhook";
  if (kind === "source_received") return "Hệ thống";
  return undefined;
}
