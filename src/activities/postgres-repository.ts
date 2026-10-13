import type { Pool } from "pg";
import type { ActivityRepository, ActivityFilters } from "./repository.js";
import type { Activity } from "./types.js";

function normalizeActivity(activity: Activity): Activity {
  return {
    ...activity,
    scheduledFor: activity.scheduledFor
      ? new Date(activity.scheduledFor).toISOString()
      : undefined,
    createdAt: new Date(activity.createdAt).toISOString(),
    updatedAt: new Date(activity.updatedAt).toISOString(),
  };
}

export class PostgresActivityRepository implements ActivityRepository {
  constructor(private readonly pool: Pool) {}

  async create(activity: Activity): Promise<Activity> {
    const result = await this.pool.query<Activity>(
      `INSERT INTO activities
        (id, owner_id, type, title, description, status, priority, scheduled_for, contact_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, owner_id AS "ownerId", type, title, description, status, priority,
                 scheduled_for AS "scheduledFor", contact_id AS "contactId",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        activity.id,
        activity.ownerId,
        activity.type,
        activity.title,
        activity.description ?? null,
        activity.status,
        activity.priority,
        activity.scheduledFor ?? null,
        activity.contactId ?? null,
        activity.createdAt,
        activity.updatedAt,
      ],
    );
    return normalizeActivity(result.rows[0]);
  }

  async findById(ownerId: string, id: string): Promise<Activity | undefined> {
    const result = await this.pool.query<Activity>(
      `SELECT id, owner_id AS "ownerId", type, title, description, status, priority,
              scheduled_for AS "scheduledFor", contact_id AS "contactId",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM activities WHERE owner_id = $1 AND id = $2`,
      [ownerId, id],
    );
    return result.rows[0] ? normalizeActivity(result.rows[0]) : undefined;
  }

  async list(ownerId: string, filters: ActivityFilters = {}): Promise<Activity[]> {
    const values: unknown[] = [ownerId];
    const conditions = ["owner_id = $1"];
    const addFilter = (condition: string, value: unknown) => {
      values.push(value);
      conditions.push(condition.replace("?", `$${values.length}`));
    };
    if (filters.status) addFilter("status = ?", filters.status);
    if (filters.type) addFilter("type = ?", filters.type);
    if (filters.priority) addFilter("priority = ?", filters.priority);
    if (filters.from) addFilter("scheduled_for >= ?", filters.from);
    if (filters.to) addFilter("scheduled_for <= ?", filters.to);

    const result = await this.pool.query<Activity>(
      `SELECT id, owner_id AS "ownerId", type, title, description, status, priority,
              scheduled_for AS "scheduledFor", contact_id AS "contactId",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM activities WHERE ${conditions.join(" AND ")}
       ORDER BY COALESCE(scheduled_for, created_at) ASC`,
      values,
    );
    return result.rows.map(normalizeActivity);
  }

  async update(ownerId: string, id: string, changes: Partial<Activity>): Promise<Activity | undefined> {
    const columnMap: Record<string, string> = {
      type: "type",
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      scheduledFor: "scheduled_for",
      contactId: "contact_id",
      updatedAt: "updated_at",
    };
    const entries = Object.entries(changes).filter(([key]) => key in columnMap);
    if (entries.length === 0) return this.findById(ownerId, id);

    const values: unknown[] = [ownerId, id];
    const assignments = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${columnMap[key]} = $${values.length}`;
    });
    const result = await this.pool.query<Activity>(
      `UPDATE activities SET ${assignments.join(", ")}
       WHERE owner_id = $1 AND id = $2
       RETURNING id, owner_id AS "ownerId", type, title, description, status, priority,
                 scheduled_for AS "scheduledFor", contact_id AS "contactId",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    return result.rows[0] ? normalizeActivity(result.rows[0]) : undefined;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM activities WHERE owner_id = $1 AND id = $2", [ownerId, id]);
    return result.rowCount === 1;
  }
}
