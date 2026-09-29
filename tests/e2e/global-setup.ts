import { Pool } from "pg";

/**
 * All E2E traffic comes from one IP, so clear rate-limit counters before a run; otherwise
 * repeated local runs trip the (intentional) per-IP sign-up limit. Never point this at production.
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('DELETE FROM "rate_limit"');
  } finally {
    await pool.end();
  }
}
