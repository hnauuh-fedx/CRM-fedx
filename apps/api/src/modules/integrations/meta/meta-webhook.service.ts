import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
  };
  postback?: { title?: string; payload?: string };
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MetaMessagingEvent[];
  }>;
};

export function verifyMetaWebhookChallenge(
  query: Record<string, unknown>,
  expectedToken: string | undefined,
) {
  const mode = typeof query["hub.mode"] === "string" ? query["hub.mode"] : undefined;
  const token = typeof query["hub.verify_token"] === "string" ? query["hub.verify_token"] : undefined;
  const challenge = typeof query["hub.challenge"] === "string" ? query["hub.challenge"] : undefined;

  if (!expectedToken || mode !== "subscribe" || !token || !challenge) return null;

  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(token, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  return challenge;
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  appSecret: string | undefined,
) {
  if (!appSecret || !signature || !/^sha256=[a-f\d]{64}$/i.test(signature)) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature.toLowerCase(), "utf8");

  return expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function getMetaMessagingEvents(payload: MetaWebhookPayload) {
  if (payload.object !== "page" || !Array.isArray(payload.entry)) return [];

  return payload.entry.flatMap((entry) =>
    (entry.messaging ?? []).map((event) => ({
      pageId: entry.id ?? event.recipient?.id ?? null,
      senderId: event.sender?.id ?? null,
      recipientId: event.recipient?.id ?? null,
      timestamp: event.timestamp ?? entry.time ?? null,
      event,
    })),
  );
}
