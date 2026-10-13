import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabasePool, runMigrations } from "./database.js";

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

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  await pool?.end();
  process.exit(1);
}
