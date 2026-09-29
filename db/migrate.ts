import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

// Arbitrary constant key; every replica takes the same lock so migrations never race.
const MIGRATION_LOCK_KEY = 7_311_2026;

export const DEFAULT_MIGRATIONS_FOLDER = path.join(process.cwd(), "db", "migrations");

/**
 * Applies pending forward-only migrations inside a session-level advisory lock (ADM-001).
 */
export async function runMigrations(pool: Pool, migrationsFolder = DEFAULT_MIGRATIONS_FOLDER): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
