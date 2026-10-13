import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

export async function createDatabasePool(databaseUrl: string): Promise<Pool> {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query("SELECT 1");
  return pool;
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  const migrationFiles = [
    "001_create_activities.sql",
    "002_create_reminders.sql",
    "003_create_contacts.sql",
    "004_create_google_calendar.sql",
    "005_create_google_calendar_events.sql",
    "006_link_google_events_to_activities.sql",
    "007_create_notes.sql",
  ];
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const name of migrationFiles) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) continue;
    const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
