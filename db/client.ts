import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(connectionString: string, max = 10): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString, max });
  return { db: drizzle(pool, { schema, casing: "snake_case" }), pool };
}

// One pool per process. Stored on globalThis so Next.js dev hot reloads don't leak pools.
const globalForDb = globalThis as unknown as { __opencalDb?: { db: Database; pool: Pool } };

function instance() {
  globalForDb.__opencalDb ??= createDatabase(getEnv().DATABASE_URL, getEnv().DATABASE_POOL_MAX);
  return globalForDb.__opencalDb;
}

export const getDb = (): Database => instance().db;
export const getPool = (): Pool => instance().pool;

/** A Drizzle transaction handle; services accept either so they compose inside transactions. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;
