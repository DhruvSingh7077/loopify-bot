import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ActivityNotFoundError, InvalidActivityTransitionError } from "./errors.js";
import type { ActivityRepository } from "./repository.js";
import { activityPriorities, activityTypes, type Activity, type ActivityPriority, type ActivityType } from "./types.js";

const createActivitySchema = z.object({
  type: z.enum(activityTypes),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(activityPriorities).default("medium"),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  contactId: z.string().trim().min(1).optional(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

const updateActivitySchema = createActivitySchema.partial().extend({
  status: z.enum(["pending", "completed", "cancelled"]).optional(),
});

export class ActivityService {
  constructor(private readonly repository: ActivityRepository) {}

  async create(ownerId: string, input: unknown): Promise<Activity> {
    const data = createActivitySchema.parse(input);
    const now = new Date().toISOString();
    return this.repository.create({
      id: randomUUID(),
      ownerId,
      ...data,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(ownerId: string, id: string, input: unknown): Promise<Activity> {
    const current = await this.repository.findById(ownerId, id);
    if (!current) throw new ActivityNotFoundError();

    const changes = updateActivitySchema.parse(input);
    if (changes.status && changes.status !== current.status) {
      const allowed =
        current.status === "pending" &&
        (changes.status === "completed" || changes.status === "cancelled");
      if (!allowed) throw new InvalidActivityTransitionError(current.status, changes.status);
    }

    const updated = await this.repository.update(ownerId, id, {
      ...changes,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new ActivityNotFoundError();
    return updated;
  }

  list(ownerId: string, filters?: { status?: Activity["status"]; type?: ActivityType; priority?: ActivityPriority }) {
    return this.repository.list(ownerId, filters);
  }

  async get(ownerId: string, id: string): Promise<Activity> {
    const activity = await this.repository.findById(ownerId, id);
    if (!activity) throw new ActivityNotFoundError();
    return activity;
  }

  complete(ownerId: string, id: string) {
    return this.update(ownerId, id, { status: "completed" });
  }

  cancel(ownerId: string, id: string) {
    return this.update(ownerId, id, { status: "cancelled" });
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const deleted = await this.repository.delete(ownerId, id);
    if (!deleted) throw new ActivityNotFoundError();
  }
}
