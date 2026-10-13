import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ActivityRepository } from "../activities/repository.js";
import { ActivityNotFoundError } from "../activities/errors.js";
import type { ContactRepository } from "./repository.js";
import { relationshipTypes, type Contact } from "./types.js";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  mobile: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  relationship: z.enum(relationshipTypes).default("other"),
  notes: z.string().trim().max(5000).optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional(),
});

const contactUpdateSchema = contactSchema.partial();

export class ContactService {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly activities: ActivityRepository,
  ) {}

  async create(ownerId: string, input: unknown): Promise<Contact> {
    const data = contactSchema.parse(input);
    const now = new Date().toISOString();
    return this.contacts.create({
      id: randomUUID(),
      ownerId,
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  list(ownerId: string, search?: string) {
    return this.contacts.list(ownerId, search);
  }

  async get(ownerId: string, id: string): Promise<Contact> {
    const contact = await this.contacts.findById(ownerId, id);
    if (!contact) throw new Error("Contact not found");
    return contact;
  }

  async update(ownerId: string, id: string, input: unknown): Promise<Contact> {
    const changes = contactUpdateSchema.parse(input);
    const updated = await this.contacts.update(ownerId, id, {
      ...changes,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new Error("Contact not found");
    return updated;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    if (!await this.contacts.delete(ownerId, id)) throw new Error("Contact not found");
  }

  async timeline(ownerId: string, contactId: string) {
    await this.get(ownerId, contactId);
    return this.activities.list(ownerId, { contactId });
  }

  async linkActivity(ownerId: string, contactId: string, activityId: string) {
    await this.get(ownerId, contactId);
    const activity = await this.activities.findById(ownerId, activityId);
    if (!activity) throw new ActivityNotFoundError();
    return this.activities.update(ownerId, activityId, { contactId, updatedAt: new Date().toISOString() });
  }
}
