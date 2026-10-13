import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ActivityNotFoundError } from "../activities/errors.js";
import { ReminderService } from "./service.js";

const ownerSchema = z.string().trim().min(1);
const uuidSchema = z.string().uuid();

function ownerIdFrom(request: { headers: Record<string, unknown> }): string {
  return ownerSchema.parse(request.headers["x-owner-id"]);
}

function idFrom(request: { params: unknown }): string {
  return z.object({ id: uuidSchema }).parse(request.params).id;
}

export function registerReminderRoutes(app: FastifyInstance, service: ReminderService) {
  app.post("/activities/:id/reminders", async (request, reply) => {
    try {
      return reply.code(201).send(await service.schedule(ownerIdFrom(request), idFrom(request), request.body));
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof ActivityNotFoundError) {
        return reply.code(error instanceof ActivityNotFoundError ? 404 : 400).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/reminders/due", async (request) => service.due(ownerIdFrom(request)));

  app.post("/reminders/:id/snooze", async (request, reply) => {
    const body = z.object({ until: z.string().datetime({ offset: true }) }).parse(request.body);
    return reply.send(await service.snooze(ownerIdFrom(request), idFrom(request), body.until));
  });

  app.post("/reminders/:id/sent", async (request) => service.markSent(ownerIdFrom(request), idFrom(request)));

  app.get("/briefing", async (request) => service.briefing(ownerIdFrom(request)));
}
