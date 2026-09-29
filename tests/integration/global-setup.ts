import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * Starts a throwaway PostgreSQL 16 for the integration suite and applies all migrations once.
 * Set TEST_DATABASE_URL to reuse an existing database instead (CI service container).
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    url = container.getConnectionUri();
  }
  const pool = new Pool({ connectionString: url });
  await runMigrations(pool);
  await pool.end();
  project.provide("databaseUrl", url);

  return async () => {
    await container?.stop();
  };
}
