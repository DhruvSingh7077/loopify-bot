import { loadConfig } from "../config.js";
import { InMemoryActivityRepository } from "../activities/repository.js";
import { ActivityService } from "../activities/service.js";
import { InMemoryReminderRepository } from "../reminders/repository.js";
import { ReminderService } from "../reminders/service.js";
import { ReminderWorker } from "../reminders/worker.js";
import { InMemoryContactRepository } from "../contacts/repository.js";
import { ContactService } from "../contacts/service.js";
import { PostgresContactRepository } from "../contacts/postgres-repository.js";
import { PostgresActivityRepository } from "../activities/postgres-repository.js";
import { PostgresReminderRepository } from "../reminders/postgres-repository.js";
import { createDatabasePool, runMigrations } from "../database.js";
import { createBot } from "./bot.js";

const config = loadConfig();
if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required to run the Telegram bot.");
}

const pool = config.DATABASE_URL ? await createDatabasePool(config.DATABASE_URL) : undefined;
if (pool) await runMigrations(pool);

const activitiesRepository = pool ? new PostgresActivityRepository(pool) : new InMemoryActivityRepository();
const activities = new ActivityService(activitiesRepository);
const reminderRepository = pool ? new PostgresReminderRepository(pool) : new InMemoryReminderRepository();
const contactRepository = pool ? new PostgresContactRepository(pool) : new InMemoryContactRepository();
const reminders = new ReminderService(activitiesRepository, reminderRepository);
const contacts = new ContactService(contactRepository, activitiesRepository);
let bot: ReturnType<typeof createBot>;
const worker = new ReminderWorker(
  activitiesRepository,
  reminders,
  {
    async send(ownerId, activityTitle, scheduledFor) {
      await bot.api.sendMessage(
        Number(ownerId),
        `Reminder: ${activityTitle}${scheduledFor ? `\nTime: ${new Date(scheduledFor).toLocaleString("en-IN", { timeZone: config.TIME_ZONE })}` : ""}`,
      );
    },
  },
  30_000,
);
bot = createBot(config.TELEGRAM_BOT_TOKEN, {
  activities,
  reminders,
  timeZone: config.TIME_ZONE,
  miniAppUrl: config.MINI_APP_URL,
  contacts,
  onOwnerSeen: (ownerId) => worker.registerOwner(ownerId),
});

worker.start();
try {
  console.log("Telegram bot started. Keep this window open.");
  await bot.start();
} catch (error) {
  console.error("Telegram bot stopped:", error);
  process.exitCode = 1;
} finally {
  worker.stop();
  await pool?.end();
}
