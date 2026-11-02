export type NotificationStreamEvent = { event: string; data: string };

/** Splits a Server-Sent Events byte stream into events; comment lines (heartbeats) are skipped. */
export function createSseParser(onEvent: (event: NotificationStreamEvent) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n?/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const separator = line.indexOf(":");
        const field = separator === -1 ? line : line.slice(0, separator);
        const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length > 0) onEvent({ event, data: data.join("\n") });
      boundary = buffer.indexOf("\n\n");
    }
  };
}

const reconnectDelaysMs = [1000, 2000, 5000, 10000, 30000];

/** Reconnect delay with jitter so pages do not reconnect together after an API restart. */
export function notificationStreamRetryDelay(attempt: number, random = Math.random) {
  const base = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)];
  return Math.round(base * (0.75 + random() * 0.5));
}
