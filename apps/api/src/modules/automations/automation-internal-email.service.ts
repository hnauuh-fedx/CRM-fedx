import { UnrecoverableError } from "bullmq";

import { env } from "../../config/env";
import { classifyAutomationDeliveryHttpStatus } from "./automation-delivery-state.service";

export function isAutomationEmailProviderAvailable() {
  return Boolean(env.AUTOMATION_EMAIL_PROVIDER_URL && env.AUTOMATION_EMAIL_PROVIDER_TOKEN);
}

export async function sendAutomationInternalEmail(input: {
  to: string;
  subject: string;
  content: string;
  idempotencyKey: string;
}) {
  if (!isAutomationEmailProviderAvailable()) return { status: "provider_unavailable" as const };
  const body = JSON.stringify({ to: input.to, subject: input.subject, content: input.content });
  if (Buffer.byteLength(body, "utf8") > 64 * 1024) {
    throw new UnrecoverableError("Nội dung email nội bộ vượt quá giới hạn 64 KB.");
  }
  const response = await fetch(env.AUTOMATION_EMAIL_PROVIDER_URL!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.AUTOMATION_EMAIL_PROVIDER_TOKEN}`,
      "idempotency-key": input.idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const classification = classifyAutomationDeliveryHttpStatus(response.status);
  if (classification === "success") return { status: "sent" as const };
  const message = `Provider EMAIL trả về HTTP ${response.status}.`;
  if (classification === "unrecoverable") throw new UnrecoverableError(message);
  throw new Error(message);
}
