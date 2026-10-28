import { Queue, Worker } from "bullmq";
import { env } from "../../config/env";
import { redisCommandConnection, redisConnection } from "../../config/redis";
import { instrumentWorker } from "../operations/worker-heartbeat";
import { processReminderNotifications } from "./reminder-notification.service";
import { processFirstContactSla } from "./first-contact-sla.service";

export function reminderQueueName() {
  const name = env.NODE_ENV === "integration" ? process.env.REMINDER_QUEUE_NAME ?? "crm_reminders_queue" : "crm_reminders_queue";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) throw new Error("Invalid reminder queue name");
  return name;
}
export function createReminderWorker() {
  if (!env.REMINDER_QUEUE_ENABLED || !redisCommandConnection || !redisConnection) return null;
  const name = reminderQueueName();
  const queue = new Queue(name, { connection: redisCommandConnection as never });
  const worker = new Worker(name, async () => {
    const reminders = await processReminderNotifications();
    await processFirstContactSla();
    return reminders;
  }, { connection: redisConnection as never, concurrency: 1 });
  instrumentWorker(worker);
  worker.on("error", () => console.error(JSON.stringify({ event: "reminder_worker_error" })));
  worker.on("failed", () => console.error(JSON.stringify({ event: "reminder_worker_failed" })));
  return { worker, queue,
    schedule: () => queue.upsertJobScheduler("reminders-and-first-contact-sla", { every: 60000 }, { name: "scan", data: {}, opts: { attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000 } }),
  };
}
