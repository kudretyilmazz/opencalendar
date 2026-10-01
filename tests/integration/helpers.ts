import { sql } from "drizzle-orm";
import { inject } from "vitest";
import { createDatabase, type Database } from "@/db/client";
import { createAuth } from "@/lib/auth/auth";
import type { EmailRequest } from "@/lib/jobs/queues";
import type { SignupMode } from "@/lib/auth/policy";

export function testDatabase(): { db: Database; close: () => Promise<void>; url: string } {
  const url = inject("databaseUrl");
  const { db, pool } = createDatabase(url, 5);
  return { db, url, close: () => pool.end() };
}

/** Removes all application rows between tests (pg-boss schema is left alone). */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE "user", "session", "account", "verification", "rate_limit", "profile_settings", "login_attempt", "team", "instance_settings", "instance_asset" CASCADE`,
  );
}

export function testAuth(db: Database, overrides: { signupMode?: SignupMode } = {}) {
  const sent: EmailRequest[] = [];
  const auth = createAuth({
    db,
    env: {
      APP_URL: "http://localhost:3000",
      AUTH_SECRET: "test-secret-test-secret-test-secret-00",
      SIGNUP_MODE: overrides.signupMode ?? "open",
      TRUSTED_PROXIES: ["127.0.0.1/32", "10.0.0.0/8"],
      oauth: { google: null, microsoft: null, zoom: null },
    },
    sendEmail: async (payload) => {
      sent.push(payload);
    },
  });
  return { auth, sent };
}

/** Builds a Request against the auth handler, like a browser would send it. */
// Requests look like they came through our proxy at 10.0.0.2, which appended the client IP.
export function authRequest(path: string, body: unknown, ip = "203.0.113.10"): Request {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `${ip}, 10.0.0.2` },
    body: JSON.stringify(body),
  });
}

export function tokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error(`No token in ${url}`);
  return token;
}
