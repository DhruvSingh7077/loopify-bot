import type { Pool } from "pg";
import type { ContactRepository } from "./repository.js";
import type { Contact } from "./types.js";

const columns = `id, owner_id AS "ownerId", name, company, mobile, email, relationship,
  notes, next_follow_up_at AS "nextFollowUpAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

export class PostgresContactRepository implements ContactRepository {
  constructor(private readonly pool: Pool) {}

  async create(contact: Contact): Promise<Contact> {
    const result = await this.pool.query<Contact>(
      `INSERT INTO contacts (id, owner_id, name, company, mobile, email, relationship, notes, next_follow_up_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,
      [contact.id, contact.ownerId, contact.name, contact.company ?? null, contact.mobile ?? null,
        contact.email ?? null, contact.relationship, contact.notes ?? null, contact.nextFollowUpAt ?? null,
        contact.createdAt, contact.updatedAt],
    );
    return result.rows[0];
  }

  async findById(ownerId: string, id: string): Promise<Contact | undefined> {
    const result = await this.pool.query<Contact>(
      `SELECT ${columns} FROM contacts WHERE owner_id = $1 AND id = $2`, [ownerId, id],
    );
    return result.rows[0];
  }

  async list(ownerId: string, search?: string): Promise<Contact[]> {
    const result = await this.pool.query<Contact>(
      `SELECT ${columns} FROM contacts
       WHERE owner_id = $1
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR company ILIKE '%' || $2 || '%'
            OR mobile ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
       ORDER BY name ASC`,
      [ownerId, search?.trim() || null],
    );
    return result.rows;
  }

  async update(ownerId: string, id: string, changes: Partial<Contact>): Promise<Contact | undefined> {
    const map: Record<string, string> = {
      name: "name", company: "company", mobile: "mobile", email: "email",
      relationship: "relationship", notes: "notes", nextFollowUpAt: "next_follow_up_at", updatedAt: "updated_at",
    };
    const entries = Object.entries(changes).filter(([key]) => key in map);
    if (!entries.length) return this.findById(ownerId, id);
    const values: unknown[] = [ownerId, id];
    const assignments = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${map[key]} = $${values.length}`;
    });
    const result = await this.pool.query<Contact>(
      `UPDATE contacts SET ${assignments.join(", ")} WHERE owner_id = $1 AND id = $2 RETURNING ${columns}`,
      values,
    );
    return result.rows[0];
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM contacts WHERE owner_id = $1 AND id = $2", [ownerId, id]);
    return result.rowCount === 1;
  }
}
