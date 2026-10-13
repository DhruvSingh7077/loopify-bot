import type { Reminder } from "./types.js";

export interface ReminderRepository {
  create(reminder: Reminder): Promise<Reminder>;
  findById(ownerId: string, id: string): Promise<Reminder | undefined>;
  listDue(ownerId: string, at: string): Promise<Reminder[]>;
  update(ownerId: string, id: string, changes: Partial<Reminder>): Promise<Reminder | undefined>;
}

export class InMemoryReminderRepository implements ReminderRepository {
  private readonly reminders = new Map<string, Reminder>();

  async create(reminder: Reminder): Promise<Reminder> {
    this.reminders.set(reminder.id, reminder);
    return reminder;
  }

  async findById(ownerId: string, id: string): Promise<Reminder | undefined> {
    const reminder = this.reminders.get(id);
    return reminder?.ownerId === ownerId ? reminder : undefined;
  }

  async listDue(ownerId: string, at: string): Promise<Reminder[]> {
    return [...this.reminders.values()].filter(
      (reminder) =>
        reminder.ownerId === ownerId &&
        reminder.status === "scheduled" &&
        reminder.remindAt <= at,
    );
  }

  async update(ownerId: string, id: string, changes: Partial<Reminder>): Promise<Reminder | undefined> {
    const current = await this.findById(ownerId, id);
    if (!current) return undefined;
    const updated = { ...current, ...changes, id: current.id, ownerId: current.ownerId };
    this.reminders.set(id, updated);
    return updated;
  }
}
