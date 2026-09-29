/**
 * Operator CLI (`node cli.js <command>` in the image, `npm run db:migrate` locally).
 */
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDatabase, type Database } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { user } from "@/db/schema";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { rotateKeys } from "@/lib/crypto/rotate";
import { EnvValidationError, getEnv } from "@/lib/env";

async function withDb(fn: (db: Database) => Promise<void>) {
  const { db, pool } = createDatabase(getEnv().DATABASE_URL, 2);
  try {
    await fn(db);
  } finally {
    await pool.end();
  }
}

const COMMANDS: Record<string, { help: string; run: () => Promise<void> }> = {
  migrate: {
    help: "Apply pending database migrations (safe to run concurrently).",
    run: async () => {
      const pool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 1 });
      try {
        await runMigrations(pool, process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "db", "migrations"));
        process.stdout.write("Migrations applied.\n");
      } finally {
        await pool.end();
      }
    },
  },
  "rotate-keys": {
    help: "Re-encrypt stored secrets with ENCRYPTION_KEY (set the old key as ENCRYPTION_KEY_PREVIOUS).",
    run: () =>
      withDb(async (db) => {
        const env = getEnv();
        if (!env.ENCRYPTION_KEY_PREVIOUS) throw new Error("Set ENCRYPTION_KEY_PREVIOUS to the old key (and ENCRYPTION_KEY to the new one) first.");
        const report = await rotateKeys(db, cipherFromEnv(env));
        let failed = 0;
        for (const [table, r] of Object.entries(report)) {
          process.stdout.write(`${table.padEnd(21)} ${r.reencrypted} of ${r.checked} re-encrypted${r.failed.length ? `, ${r.failed.length} unreadable: ${r.failed.join(", ")}` : ""}\n`);
          failed += r.failed.length;
        }
        if (failed) {
          throw new Error(`${failed} value(s) could not be decrypted with either key. Keep ENCRYPTION_KEY_PREVIOUS until they are fixed or removed.`);
        }
        process.stdout.write("Done. Remove ENCRYPTION_KEY_PREVIOUS once queued jobs have drained (a few minutes).\n");
      }),
  },
  "create-admin": {
    help: "create-admin <email>: make an existing account an instance administrator.",
    run: () =>
      withDb(async (db) => {
        const email = process.argv[3]?.trim().toLowerCase();
        if (!email) throw new Error("Usage: cli create-admin <email>");
        const updated = await db.update(user).set({ role: "admin" }).where(eq(sql`lower(${user.email})`, email)).returning({ id: user.id });
        if (!updated.length) throw new Error(`No account with the email ${email}. Sign up first, then run this again.`);
        process.stdout.write(`${email} is now an administrator.\n`);
      }),
  },
};

async function main() {
  const name = process.argv[2];
  const command = name ? COMMANDS[name] : undefined;
  if (!command) {
    const list = Object.entries(COMMANDS).map(([n, c]) => `  ${n.padEnd(13)} ${c.help}`).join("\n");
    process.stdout.write(`Usage: cli <command>\n\nCommands:\n${list}\n`);
    process.exit(name ? 1 : 0);
  }
  await command.run();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof EnvValidationError ? error.message : String(error)}\n`);
  process.exit(1);
});
