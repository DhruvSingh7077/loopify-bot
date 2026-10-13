import type { Pool } from "pg";
import type { ReminderRepository } from "./repository.js";
import type { Reminder } from "./types.js";

const columns = `id, owner_id AS "ownerId", activity_id AS "activityId", remind_at AS "remindAt",
  status, snoozed_until AS "snoozedUntil", created_at AS "createdAt"`;

export class PostgresReminderRepository implements ReminderRepository {
  constructor(private readonly pool: Pool) {}

  async create(reminder: Reminder): Promise<Reminder> {
    const result = await this.pool.query<Reminder>(
      `INSERT INTO reminders (id, owner_id, activity_id, remind_at, status, snoozed_until, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
      [reminder.id, reminder.ownerId, reminder.activityId, reminder.remindAt, reminder.status,
        reminder.snoozedUntil ?? null, reminder.createdAt],
    );
    return result.rows[0];
  }

  async findById(ownerId: string, id: string): Promise<Reminder | undefined> {
    const result = await this.pool.query<Reminder>(
      `SELECT ${columns} FROM reminders WHERE owner_id = $1 AND id = $2`, [ownerId, id],
    );
    return result.rows[0];
  }

  async listDue(ownerId: string, at: string): Promise<Reminder[]> {
    const result = await this.pool.query<Reminder>(
      `SELECT ${columns} FROM reminders
       WHERE owner_id = $1 AND status = 'scheduled' AND remind_at <= $2
       ORDER BY remind_at ASC`,
      [ownerId, at],
    );
    return result.rows;
  }

  async update(ownerId: string, id: string, changes: Partial<Reminder>): Promise<Reminder | undefined> {
    const map: Record<string, string> = {
      remindAt: "remind_at", status: "status", snoozedUntil: "snoozed_until",
    };
    const entries = Object.entries(changes).filter(([key]) => key in map);
    if (!entries.length) return this.findById(ownerId, id);
    const values: unknown[] = [ownerId, id];
    const assignments = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${map[key]} = $${values.length}`;
    });
    const result = await this.pool.query<Reminder>(
      `UPDATE reminders SET ${assignments.join(", ")} WHERE owner_id = $1 AND id = $2 RETURNING ${columns}`,
      values,
    );
    return result.rows[0];
  }
}
