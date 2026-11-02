import { Client } from "pg";
import { z } from "zod";

import { sessionDatabaseConnectionOptions } from "../../config/postgres";
import { createNotificationStreamHub, type NotificationStreamListener } from "./notification-stream-hub";

// Channel raised by the notifications table trigger (migration 20261030100000).
const channel = "crm_personal_notifications";
const maxStreamsPerUser = 10;
const reconnectDelaysMs = [1000, 2000, 5000, 10000, 30000];

const hub = createNotificationStreamHub(maxStreamsPerUser);
const streamClosers = new Set<() => void>();
let client: Client | null = null;
let starting: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;
let stopped = false;

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)];
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void ensureListening(); }, delay);
  reconnectTimer.unref();
}

// LISTEN needs a session connection, so it uses the direct URL rather than a transaction pooler.
async function connect() {
  const next = new Client(sessionDatabaseConnectionOptions);
  const dropped = () => {
    if (client !== next) return;
    client = null;
    void next.end().catch(() => undefined);
    console.error(JSON.stringify({ event: "notification_listener_disconnected" }));
    scheduleReconnect();
  };
  next.on("error", dropped);
  next.on("end", dropped);
  next.on("notification", (message) => {
    const userId = z.uuid().safeParse(message.payload);
    if (message.channel === channel && userId.success) hub.publish(userId.data);
  });
  try {
    await next.connect();
    await next.query(`LISTEN ${channel}`);
  } catch (error) {
    next.removeAllListeners();
    await next.end().catch(() => undefined);
    throw error;
  }
  client = next;
  // Signals sent while disconnected are lost: open streams refetch once.
  if (reconnectAttempt > 0) hub.publishAll();
  reconnectAttempt = 0;
}

function ensureListening() {
  if (stopped || client) return Promise.resolve();
  starting ??= connect()
    .catch(() => {
      console.error(JSON.stringify({ event: "notification_listener_connect_failed" }));
      scheduleReconnect();
    })
    .finally(() => { starting = null; });
  return starting;
}

/**
 * Registers one open stream of the user. Returns null when the user holds too many streams.
 * The listener only means "refetch"; the stream never carries notification content.
 */
export function subscribeToPersonalNotifications(userId: string, listener: NotificationStreamListener, close: () => void) {
  const unsubscribe = hub.subscribe(userId, listener);
  if (!unsubscribe) return null;
  streamClosers.add(close);
  void ensureListening();
  return () => { unsubscribe(); streamClosers.delete(close); };
}

/** Ends every open stream (so the HTTP server can drain) and stops listening. */
export async function closeNotificationRealtime() {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  for (const close of [...streamClosers]) close();
  await starting;
  const current = client;
  client = null;
  await current?.end().catch(() => undefined);
}
