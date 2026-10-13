import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabasePool, runMigrations } from "./database.js";
import { InMemoryActivityRepository } from "./activities/repository.js";
import { ActivityService } from "./activities/service.js";
import { PostgresActivityRepository } from "./activities/postgres-repository.js";
import { InMemoryReminderRepository } from "./reminders/repository.js";
import { PostgresReminderRepository } from "./reminders/postgres-repository.js";
import { ReminderService } from "./reminders/service.js";
import { ReminderWorker } from "./reminders/worker.js";
import { InMemoryContactRepository } from "./contacts/repository.js";
import { PostgresContactRepository } from "./contacts/postgres-repository.js";
import { ContactService } from "./contacts/service.js";
import { createBot } from "./bot/bot.js";

const config = loadConfig();
const pool = config.DATABASE_URL ? await createDatabasePool(config.DATABASE_URL) : undefined;
if (pool) await runMigrations(pool);

const app = buildApp({
  pool,
  telegramBotToken: config.TELEGRAM_BOT_TOKEN,
  googleCalendar: {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: config.GOOGLE_REDIRECT_URI,
    encryptionKey: config.GOOGLE_TOKEN_ENCRYPTION_KEY,
  },
});

if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required for the production entrypoint.");
}

const activitiesRepository = pool
  ? new PostgresActivityRepository(pool)
  : new InMemoryActivityRepository();
const activities = new ActivityService(activitiesRepository);
const remindersRepository = pool
  ? new PostgresReminderRepository(pool)
  : new InMemoryReminderRepository();
const reminders = new ReminderService(activitiesRepository, remindersRepository);
const contactsRepository = pool
  ? new PostgresContactRepository(pool)
  : new InMemoryContactRepository();
const contacts = new ContactService(contactsRepository, activitiesRepository);

let bot: ReturnType<typeof createBot>;
const worker = new ReminderWorker(
  activitiesRepository,
  reminders,
  {
    async send(ownerId, activityTitle, scheduledFor) {
      await bot.api.sendMessage(
        Number(ownerId),
        `Reminder: ${activityTitle}${scheduledFor
          ? `\nTime: ${new Date(scheduledFor).toLocaleString("en-IN", { timeZone: config.TIME_ZONE })}`
          : ""}`,
      );
    },
  },
  30_000,
);

bot = createBot(config.TELEGRAM_BOT_TOKEN, {
  activities,
  reminders,
  contacts,
  timeZone: config.TIME_ZONE,
  miniAppUrl: config.MINI_APP_URL,
  onOwnerSeen: (ownerId) => worker.registerOwner(ownerId),
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  worker.stop();
  bot.stop();
  await app.close();
  await pool?.end();
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  worker.start();
  console.log("Web server and Telegram bot started.");
  await bot.start();
} catch (error) {
  app.log.error(error);
  await shutdown("startup failure");
  process.exitCode = 1;
}
