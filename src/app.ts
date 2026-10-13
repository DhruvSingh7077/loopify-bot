import cors from "@fastify/cors";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryActivityRepository } from "./activities/repository.js";
import { registerActivityRoutes } from "./activities/routes.js";
import { ActivityService } from "./activities/service.js";
import { InMemoryReminderRepository } from "./reminders/repository.js";
import { registerReminderRoutes } from "./reminders/routes.js";
import { ReminderService } from "./reminders/service.js";
import { InMemoryContactRepository } from "./contacts/repository.js";
import { ContactService } from "./contacts/service.js";
import { registerContactRoutes } from "./contacts/routes.js";
import type { Pool } from "pg";
import { PostgresActivityRepository } from "./activities/postgres-repository.js";
import { PostgresReminderRepository } from "./reminders/postgres-repository.js";
import { PostgresContactRepository } from "./contacts/postgres-repository.js";
import { verifyTelegramInitData } from "./telegram-auth.js";
import { registerGoogleCalendarRoutes } from "./calendar.js";
import { InMemoryNoteRepository } from "./notes/repository.js";
import { PostgresNoteRepository } from "./notes/postgres-repository.js";
import { NoteService } from "./notes/service.js";
import { registerNoteRoutes } from "./notes/routes.js";
import { registerReportRoutes } from "./reports/routes.js";

export interface AppOptions {
  pool?: Pool;
  telegramBotToken?: string;
  googleCalendar?: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    encryptionKey?: string;
  };
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: true });
  const activityRepository = options.pool
    ? new PostgresActivityRepository(options.pool)
    : new InMemoryActivityRepository();
  const activityService = new ActivityService(activityRepository);
  const reminderService = new ReminderService(
    activityRepository,
    options.pool ? new PostgresReminderRepository(options.pool) : new InMemoryReminderRepository(),
  );
  const contactService = new ContactService(
    options.pool ? new PostgresContactRepository(options.pool) : new InMemoryContactRepository(),
    activityRepository,
  );
  const noteService = new NoteService(
    options.pool ? new PostgresNoteRepository(options.pool) : new InMemoryNoteRepository(),
  );

  app.register(cors, { origin: true });
  app.register(fastifyStatic, {
    root: path.join(path.dirname(fileURLToPath(import.meta.url)), "../public"),
    prefix: "/",
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "loopify-owner-assistant",
  }));

  app.get("/", async (_request, reply) => {
    return reply.redirect("/mini-app/");
  });

  if (options.telegramBotToken) {
    const telegramBotToken = options.telegramBotToken;
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith("/calendar/callback")) return;
      if (!request.url.startsWith("/reports") && !request.url.startsWith("/activities") &&
          !request.url.startsWith("/briefing") && !request.url.startsWith("/reminders") &&
          !request.url.startsWith("/contacts") && !request.url.startsWith("/calendar") &&
          !request.url.startsWith("/notes")) return;
      try {
        const ownerId = verifyTelegramInitData(
          String(request.headers["x-telegram-init-data"] ?? ""),
          telegramBotToken,
        );
        request.headers["x-owner-id"] = ownerId;
      } catch (error) {
        return reply.code(401).send({ error: error instanceof Error ? error.message : "Authentication failed." });
      }
    });
  }

  registerActivityRoutes(app, activityService, options.pool, options.googleCalendar);
  registerReminderRoutes(app, reminderService);
  registerContactRoutes(app, contactService);
  registerGoogleCalendarRoutes(app, options.pool, options.googleCalendar ?? {});
  registerNoteRoutes(app, noteService);
  registerReportRoutes(app, activityRepository);

  return app;
}
