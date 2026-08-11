import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database/prisma";
import { processReminderNotifications } from "./modules/leads/reminder-notification.service";

const REMINDER_NOTIFICATION_INTERVAL_MS = 60_000;

const server = app.listen(env.PORT, () => {
  console.log(`Admission CRM API listening on http://localhost:${env.PORT}`);
});

async function runReminderNotificationProcessor() {
  try {
    await processReminderNotifications();
  } catch (error) {
    console.error("Reminder notification processor failed.", error);
  }
}

void runReminderNotificationProcessor();
const reminderNotificationInterval = setInterval(() => {
  void runReminderNotificationProcessor();
}, REMINDER_NOTIFICATION_INTERVAL_MS);

async function shutdown() {
  clearInterval(reminderNotificationInterval);
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
