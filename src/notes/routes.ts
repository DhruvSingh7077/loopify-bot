import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NoteService } from "./service.js";

const ownerSchema = z.string().trim().min(1);
const idSchema = z.string().uuid();
const ownerIdFrom = (request: { headers: Record<string, unknown> }) => ownerSchema.parse(request.headers["x-owner-id"]);
const idFrom = (request: { params: unknown }) => z.object({ id: idSchema }).parse(request.params).id;

function sendError(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: error.message });
  if (error instanceof Error && error.message === "Note not found") return reply.code(404).send({ error: error.message });
  throw error;
}

export function registerNoteRoutes(app: FastifyInstance, service: NoteService) {
  app.post("/notes", async (request, reply) => {
    try { return reply.code(201).send(await service.create(ownerIdFrom(request), request.body)); }
    catch (error) { return sendError(reply, error); }
  });
  app.get("/notes", async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    return service.list(ownerIdFrom(request), query.search);
  });
  app.get("/notes/:id", async (request, reply) => {
    try { return await service.get(ownerIdFrom(request), idFrom(request)); }
    catch (error) { return sendError(reply, error); }
  });
  app.patch("/notes/:id", async (request, reply) => {
    try { return await service.update(ownerIdFrom(request), idFrom(request), request.body); }
    catch (error) { return sendError(reply, error); }
  });
  app.delete("/notes/:id", async (request, reply) => {
    try {
      await service.delete(ownerIdFrom(request), idFrom(request));
      return reply.code(204).send();
    } catch (error) { return sendError(reply, error); }
  });
}
