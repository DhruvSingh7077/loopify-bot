import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ActivityNotFoundError, InvalidActivityTransitionError } from "./errors.js";
import { ActivityService } from "./service.js";
import type { Pool } from "pg";
import { deleteLinkedGoogleEvent, updateLinkedGoogleEvent, type GoogleCalendarOptions } from "../calendar.js";

const ownerHeaderSchema = z.string().trim().min(1);
const idSchema = z.string().uuid();

function ownerIdFrom(request: { headers: Record<string, unknown> }): string {
  const result = ownerHeaderSchema.safeParse(request.headers["x-owner-id"]);
  if (!result.success) throw new Error("x-owner-id header is required");
  return result.data;
}

function activityIdFrom(request: { params: unknown }): string {
  return z.object({ id: idSchema }).parse(request.params).id;
}

function sendActivityError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown) {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: error.message });
  if (error instanceof ActivityNotFoundError) return reply.code(404).send({ error: error.message });
  if (error instanceof InvalidActivityTransitionError) return reply.code(409).send({ error: error.message });
  throw error;
}

export function registerActivityRoutes(
  app: FastifyInstance,
  service: ActivityService,
  pool?: Pool,
  googleCalendar?: GoogleCalendarOptions,
) {
  app.post("/activities", async (request, reply) => {
    try {
      const ownerId = ownerIdFrom(request);
      const activity = await service.create(ownerId, request.body);
      return reply.code(201).send(activity);
    } catch (error) {
      return sendActivityError(reply, error);
    }
  });

  app.get("/activities", async (request) => {
    const ownerId = ownerIdFrom(request);
    const query = z.object({
      status: z.enum(["pending", "completed", "cancelled"]).optional(),
      type: z.enum(["task", "meeting", "call", "follow-up"]).optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    }).parse(request.query);
    return service.list(ownerId, query);
  });

  app.get("/activities/:id", async (request, reply) => {
    try {
      return await service.get(ownerIdFrom(request), activityIdFrom(request));
    } catch (error) {
      return sendActivityError(reply, error);
    }
  });

  app.patch("/activities/:id", async (request, reply) => {
    try {
      const ownerId = ownerIdFrom(request);
      const activity = await service.update(ownerId, activityIdFrom(request), request.body);
      if (pool && googleCalendar) await updateLinkedGoogleEvent(pool, ownerId, activity, googleCalendar);
      return activity;
    } catch (error) {
      return sendActivityError(reply, error);
    }
  });

  app.post("/activities/:id/complete", async (request, reply) => {
    try {
      return await service.complete(ownerIdFrom(request), activityIdFrom(request));
    } catch (error) {
      return sendActivityError(reply, error);
    }
  });

  app.post("/activities/:id/cancel", async (request, reply) => {
    try {
      return await service.cancel(ownerIdFrom(request), activityIdFrom(request));
    } catch (error) {
      return sendActivityError(reply, error);
    }
  });

  app.delete("/activities/:id", async (request, reply) => {
    try {
      const ownerId = ownerIdFrom(request);
      const id = activityIdFrom(request);
      if (pool && googleCalendar) await deleteLinkedGoogleEvent(pool, ownerId, id, googleCalendar);
      await service.delete(ownerId, id);
      return reply.code(204).send();
    } catch (error) {
      return sendActivityError(reply, error);
    }
  });
}
