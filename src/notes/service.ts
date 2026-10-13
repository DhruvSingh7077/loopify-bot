import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NoteRepository } from "./repository.js";

const noteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10000),
  contactId: z.string().uuid().optional(),
  notedAt: z.string().datetime({ offset: true }).optional(),
});

export class NoteService {
  constructor(private readonly repository: NoteRepository) {}

  create(ownerId: string, input: unknown) {
    const data = noteSchema.parse(input);
    const now = new Date().toISOString();
    return this.repository.create({ id: randomUUID(), ownerId, ...data, createdAt: now, updatedAt: now });
  }

  list(ownerId: string, search?: string) {
    return this.repository.list(ownerId, search);
  }

  async get(ownerId: string, id: string) {
    const note = await this.repository.findById(ownerId, id);
    if (!note) throw new Error("Note not found");
    return note;
  }

  async update(ownerId: string, id: string, input: unknown) {
    const changes = noteSchema.partial().parse(input);
    const note = await this.repository.update(ownerId, id, { ...changes, updatedAt: new Date().toISOString() });
    if (!note) throw new Error("Note not found");
    return note;
  }

  async delete(ownerId: string, id: string) {
    if (!await this.repository.delete(ownerId, id)) throw new Error("Note not found");
  }
}
