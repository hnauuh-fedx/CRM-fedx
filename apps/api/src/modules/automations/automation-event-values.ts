import type { AutomationContext } from "./automation-execution.types";

export function getAutomationEventValues(context: Pick<AutomationContext, "payload">) {
  const values = new Map<string, unknown>();
  if (!context.payload || typeof context.payload !== "object" || Array.isArray(context.payload)) return values;
  const payload = context.payload as Record<string, unknown>;
  for (const key of ["eventType", "formId", "submissionId", "configurationVersion"] as const) values.set(`event:${key}`, payload[key]);
  const answers = payload.answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    for (const [key, value] of Object.entries(answers)) values.set(`event:answer:${key}`, value);
  }
  return values;
}
