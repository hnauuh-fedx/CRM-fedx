import { useEffect, useRef } from "react";

import { ApiError } from "@/services/api";
import { openNotificationStream } from "@/services/notification.service";
import { createSseParser, notificationStreamRetryDelay } from "./notification-stream";

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * Keeps a Server-Sent Events connection open and calls onChange whenever the user's notifications
 * change, or after a reconnect (signals may have been missed). The caller keeps polling as fallback.
 */
export function useNotificationStream(accessToken: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function run() {
      let attempt = 0;
      let hasConnected = false;
      while (!signal.aborted) {
        try {
          const body = await openNotificationStream(accessToken, signal);
          const reader = body.pipeThrough(new TextDecoderStream()).getReader();
          const parse = createSseParser(({ event }) => {
            if (event === "ready") {
              attempt = 0;
              if (hasConnected) onChangeRef.current();
              hasConnected = true;
            } else if (event === "notifications") {
              onChangeRef.current();
            }
          });
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parse(value);
          }
        } catch (error) {
          if (signal.aborted) return;
          // Session ended: the auth layer already asked the user to sign in again.
          if (error instanceof ApiError && [401, 403].includes(error.status)) return;
        }
        await wait(notificationStreamRetryDelay(attempt), signal);
        attempt += 1;
      }
    }

    void run();
    return () => controller.abort();
  }, [accessToken]);
}
