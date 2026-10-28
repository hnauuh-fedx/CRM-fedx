export type RedisFeatures = { webhook: boolean; automation: boolean; zalo: boolean; meta: boolean; reminders: boolean };
type Flags = { NODE_ENV?: string; WEBHOOK_QUEUE_ENABLED?: boolean | string; DISABLE_AUTOMATION_WORKER?: string; ZALO_QUEUE_ENABLED?: boolean | string; META_QUEUE_ENABLED?: boolean | string; REMINDER_QUEUE_ENABLED?: boolean | string };
const enabled = (value: boolean | string | undefined) => value !== false && value !== "false";
export function resolveRedisFeatures(flags: Flags): RedisFeatures {
  if (flags.NODE_ENV === "test") return { webhook: false, automation: false, zalo: false, meta: false, reminders: false };
  return { webhook: enabled(flags.WEBHOOK_QUEUE_ENABLED), automation: flags.DISABLE_AUTOMATION_WORKER !== "true", zalo: enabled(flags.ZALO_QUEUE_ENABLED), meta: enabled(flags.META_QUEUE_ENABLED), reminders: enabled(flags.REMINDER_QUEUE_ENABLED) };
}
export function requiresRedis(features: RedisFeatures) { return Object.values(features).some(Boolean); }
export function monitoredQueueNames(features: RedisFeatures, automationBase = "automation_engine_queue", reminderName = "crm_reminders_queue") {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(automationBase)) throw new Error("Invalid automation queue name.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(reminderName)) throw new Error("Invalid reminder queue name.");
  return [
    ...(features.webhook ? ["webhook_inbound_queue"] : []),
    ...(features.automation ? [automationBase, `${automationBase}_bulk_prepare`, `${automationBase}_bulk_lead`, `${automationBase}_reassignment`] : []),
    ...(features.zalo ? ["zalo_integration_queue"] : []), ...(features.meta ? ["meta_messenger_integration_queue"] : []),
    ...(features.reminders ? [reminderName] : []),
  ];
}
