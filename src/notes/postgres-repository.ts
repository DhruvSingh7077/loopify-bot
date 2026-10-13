import type { Pool } from "pg";
import type { Note } from "./types.js";
import type { NoteRepository } from "./repository.js";

const columns = `id, owner_id AS "ownerId", title, content, contact_id AS "contactId",
  noted_at AS "notedAt", created_at AS "createdAt", updated_at AS "updatedAt"`;

export class PostgresNoteRepository implements NoteRepository {
  constructor(private readonly pool: Pool) {}

  async create(note: Note) {
    const result = await this.pool.query<Note>(
      `INSERT INTO notes (id, owner_id, title, content, contact_id, noted_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`,
      [note.id, note.ownerId, note.title, note.content, note.contactId ?? null, note.notedAt ?? null, note.createdAt, note.updatedAt],
    );
    return result.rows[0];
  }

  async list(ownerId: string, search?: string) {
    const result = await this.pool.query<Note>(
      `SELECT ${columns} FROM notes
       WHERE owner_id = $1 AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%' OR content ILIKE '%' || $2 || '%')
       ORDER BY created_at DESC`,
      [ownerId, search?.trim() || null],
    );
    return result.rows;
  }

  async findById(ownerId: string, id: string) {
    const result = await this.pool.query<Note>(`SELECT ${columns} FROM notes WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
    return result.rows[0];
  }

  async update(ownerId: string, id: string, changes: Partial<Note>) {
    const map: Record<string, string> = {
      title: "title", content: "content", contactId: "contact_id", notedAt: "noted_at", updatedAt: "updated_at",
    };
    const entries = Object.entries(changes).filter(([key]) => key in map);
    if (!entries.length) return this.findById(ownerId, id);
    const values: unknown[] = [ownerId, id];
    const assignments = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${map[key]} = $${values.length}`;
    });
    const result = await this.pool.query<Note>(
      `UPDATE notes SET ${assignments.join(", ")} WHERE owner_id = $1 AND id = $2 RETURNING ${columns}`,
      values,
    );
    return result.rows[0];
  }

  async delete(ownerId: string, id: string) {
    const result = await this.pool.query("DELETE FROM notes WHERE owner_id = $1 AND id = $2", [ownerId, id]);
    return result.rowCount === 1;
  }
}
