import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ActivityNotFoundError } from "../activities/errors.js";
import { ContactService } from "./service.js";

const ownerSchema = z.string().trim().min(1);
const idSchema = z.string().uuid();

function ownerIdFrom(request: { headers: Record<string, unknown> }) {
  return ownerSchema.parse(request.headers["x-owner-id"]);
}

function idFrom(request: { params: unknown }) {
  return z.object({ id: idSchema }).parse(request.params).id;
}

function sendError(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: error.message });
  if (error instanceof ActivityNotFoundError) return reply.code(404).send({ error: error.message });
  if (error instanceof Error && error.message === "Contact not found") return reply.code(404).send({ error: error.message });
  throw error;
}

export function registerContactRoutes(app: FastifyInstance, service: ContactService) {
  app.post("/contacts", async (request, reply) => {
    try {
      return reply.code(201).send(await service.create(ownerIdFrom(request), request.body));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/contacts", async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    return service.list(ownerIdFrom(request), query.search);
  });

  app.get("/contacts/:id", async (request, reply) => {
    try {
      return await service.get(ownerIdFrom(request), idFrom(request));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch("/contacts/:id", async (request, reply) => {
    try {
      return await service.update(ownerIdFrom(request), idFrom(request), request.body);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete("/contacts/:id", async (request, reply) => {
    try {
      await service.delete(ownerIdFrom(request), idFrom(request));
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/contacts/:id/timeline", async (request, reply) => {
    try {
      return await service.timeline(ownerIdFrom(request), idFrom(request));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/contacts/:id/activities/:activityId", async (request, reply) => {
    try {
      const params = z.object({ id: idSchema, activityId: idSchema }).parse(request.params);
      return await service.linkActivity(ownerIdFrom(request), params.id, params.activityId);
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
