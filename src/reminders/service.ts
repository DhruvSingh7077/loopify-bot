import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ActivityRepository } from "../activities/repository.js";
import { ActivityNotFoundError } from "../activities/errors.js";
import type { Activity } from "../activities/types.js";
import type { Briefing, Recurrence, Reminder } from "./types.js";
import type { ReminderRepository } from "./repository.js";

const reminderInputSchema = z.object({
  remindAt: z.string().datetime({ offset: true }),
});

const recurrenceSchema = z.discriminatedUnion("frequency", [
  z.object({ frequency: z.literal("daily"), interval: z.number().int().positive().default(1) }),
  z.object({
    frequency: z.literal("weekly"),
    interval: z.number().int().positive().default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  }),
  z.object({ frequency: z.literal("monthly"), interval: z.number().int().positive().default(1) }),
]);

export function nextOccurrence(from: Date, recurrence: Recurrence): Date {
  const next = new Date(from);
  const interval = recurrence.interval ?? 1;
  if (recurrence.frequency === "daily") next.setUTCDate(next.getUTCDate() + interval);
  if (recurrence.frequency === "weekly") {
    if (recurrence.weekdays?.length) {
      const sorted = [...recurrence.weekdays].sort((a, b) => a - b);
      const currentDay = next.getUTCDay();
      const nextDay = sorted.find((day) => day > currentDay);
      const days = nextDay === undefined ? 7 - currentDay + sorted[0] : nextDay - currentDay;
      next.setUTCDate(next.getUTCDate() + days + (nextDay === undefined ? (interval - 1) * 7 : 0));
    } else {
      next.setUTCDate(next.getUTCDate() + interval * 7);
    }
  }
  if (recurrence.frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + interval);
  return next;
}

export class ReminderService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly reminders: ReminderRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async schedule(ownerId: string, activityId: string, input: unknown): Promise<Reminder> {
    const activity = await this.activities.findById(ownerId, activityId);
    if (!activity) throw new ActivityNotFoundError();
    const data = reminderInputSchema.parse(input);
    return this.reminders.create({
      id: randomUUID(),
      ownerId,
      activityId,
      remindAt: data.remindAt,
      status: "scheduled",
      createdAt: this.now().toISOString(),
    });
  }

  async scheduleDefault(ownerId: string, activityId: string): Promise<Reminder | undefined> {
    const activity = await this.activities.findById(ownerId, activityId);
    if (!activity?.scheduledFor) return undefined;
    const remindAt = new Date(new Date(activity.scheduledFor).getTime() - 15 * 60_000);
    return this.schedule(ownerId, activityId, { remindAt: remindAt.toISOString() });
  }

  async due(ownerId: string): Promise<Reminder[]> {
    return this.reminders.listDue(ownerId, this.now().toISOString());
  }

  async snooze(ownerId: string, reminderId: string, until: string): Promise<Reminder> {
    const data = reminderInputSchema.parse({ remindAt: until });
    const reminder = await this.reminders.update(ownerId, reminderId, {
      remindAt: data.remindAt,
      snoozedUntil: data.remindAt,
      status: "scheduled",
    });
    if (!reminder) throw new Error("Reminder not found");
    return reminder;
  }

  async markSent(ownerId: string, reminderId: string): Promise<Reminder> {
    const reminder = await this.reminders.update(ownerId, reminderId, { status: "sent" });
    if (!reminder) throw new Error("Reminder not found");
    return reminder;
  }

  async briefing(ownerId: string, at = this.now()): Promise<Briefing> {
    const startOfToday = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
    const endOfUpcoming = new Date(startOfToday);
    endOfUpcoming.setUTCDate(endOfUpcoming.getUTCDate() + 8);
    const pending = await this.activities.list(ownerId, { status: "pending" });
    const overdue = pending.filter((activity) => activity.scheduledFor && activity.scheduledFor < at.toISOString());
    const today = pending.filter((activity) => this.isBetween(activity, startOfToday, startOfTomorrow));
    const upcoming = pending.filter((activity) => this.isBetween(activity, startOfTomorrow, endOfUpcoming));
    const nextActivity = [...pending]
      .filter((activity) => activity.scheduledFor && activity.scheduledFor >= at.toISOString())
      .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))[0];
    return { overdue, today, upcoming, nextActivity };
  }

  static recurrence(input: unknown): Recurrence {
    return recurrenceSchema.parse(input);
  }

  private isBetween(activity: Activity, from: Date, to: Date): boolean {
    return Boolean(
      activity.scheduledFor &&
      activity.scheduledFor >= from.toISOString() &&
      activity.scheduledFor < to.toISOString(),
    );
  }
}
