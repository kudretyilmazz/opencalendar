import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerWorkers } from "@/jobs/register";
import type { OutgoingEmail } from "@/lib/email/transport";
import { startBoss } from "@/lib/jobs/boss";
import { enqueueWith } from "@/lib/jobs/enqueue";
import { createCipher } from "@/lib/crypto/encryption";
import { parseEnv } from "@/lib/env";
import { type EmailRequest, QUEUES, sealEmail } from "@/lib/jobs/queues";
import { testDatabase } from "./helpers";

const { db, url, close } = testDatabase();
const cipher = createCipher({ current: Buffer.alloc(32, 5).toString("base64") });
const email = (request: EmailRequest) => sealEmail(cipher, request);

let boss: PgBoss;
const sent: OutgoingEmail[] = [];
let failNext = 0;

async function startWorker(): Promise<PgBoss> {
  const worker = await startBoss(url, "worker");
  await registerWorkers(worker, {
    db,
    cipher,
    env: parseEnv({
      DATABASE_URL: url,
      APP_URL: "http://localhost:3000",
      AUTH_SECRET: "x".repeat(32),
      ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
      SMTP_HOST: "localhost",
      SMTP_FROM: "t@x.test",
    }),
    from: "OpenCalendar <no-reply@test.local>",
    mailer: {
      send: async (email) => {
        if (failNext > 0) {
          failNext -= 1;
          throw new Error("SMTP unavailable");
        }
        sent.push(email);
      },
    },
  });
  return worker;
}

beforeAll(async () => {
  boss = await startWorker();
});

afterAll(async () => {
  await boss.stop({ graceful: false, close: true });
  await close();
});

async function waitFor<T>(check: () => Promise<T | undefined> | T | undefined, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for condition");
}

describe("email queue (NTF-001)", () => {
  it("creates the queue with retry policy and a dead-letter queue", async () => {
    const queue = await boss.getQueue(QUEUES.emailSend.name);
    expect(queue).toMatchObject({ retryLimit: 8, retryBackoff: true, deadLetter: QUEUES.emailSend.deadLetter });
    expect(await boss.getSchedules()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: QUEUES.maintenance.name })]),
    );
  });

  it("delivers an enqueued email through the worker", async () => {
    await enqueueWith(boss, "emailSend", email({ to: "ada@example.com", template: "magic-link", props: { url: "https://x.test/m?token=1" } }));
    const delivered = await waitFor(() => sent.find((m) => m.to === "ada@example.com"));
    expect(delivered.subject).toMatch(/sign in/i);
    expect(delivered.from).toBe("OpenCalendar <no-reply@test.local>");
  });

  it("retries a transport failure within seconds and records it on the job", async () => {
    const started = Date.now();
    failNext = 1;
    const id = await enqueueWith(
      boss,
      "emailSend",
      email({ to: "retry@example.com", template: "magic-link", props: { url: "https://x.test/m?token=2" } }),
    );
    await waitFor(() => sent.find((m) => m.to === "retry@example.com"));
    // The job is marked completed right after the handler returns.
    const job = await waitFor(async () => {
      const current = await boss.getJobById(QUEUES.emailSend.name, id!);
      return current?.state === "completed" ? current : undefined;
    });
    expect(job.retryCount).toBeGreaterThanOrEqual(1);
    expect(Date.now() - started).toBeLessThan(10_000); // retries don't wait for a slow poll
  });

  it("drains a burst of emails quickly (concurrent consumers + LISTEN/NOTIFY)", async () => {
    const started = Date.now();
    const to = Array.from({ length: 20 }, (_, i) => `burst${i}@example.com`);
    for (const address of to) await enqueueWith(boss, "emailSend", email({ to: address, template: "magic-link", props: { url: "https://x.test/m?token=b" } }));
    await waitFor(() => (to.every((a) => sent.some((m) => m.to === a)) ? true : undefined));
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("never stores the one-time link in clear in the job table", async () => {
    const id = await enqueueWith(
      boss,
      "emailSend",
      email({ to: "secret@example.com", template: "magic-link", props: { url: "https://x.test/m?token=SUPERSECRET" } }),
    );
    const job = await boss.getJobById(QUEUES.emailSend.name, id!);
    expect(JSON.stringify(job?.data)).not.toContain("SUPERSECRET");
    await waitFor(() => sent.find((m) => m.to === "secret@example.com"));
    expect(sent.find((m) => m.to === "secret@example.com")?.text).toContain("SUPERSECRET");
  });

  it("rejects invalid payloads at enqueue time", async () => {
    await expect(
      enqueueWith(boss, "emailSend", { to: "not-an-email", template: "magic-link", sealed: "x" }),
    ).rejects.toThrow();
  });

  it("can enqueue inside an application transaction", async () => {
    const { fromDrizzle } = await import("pg-boss");
    await db.transaction(async (tx) => {
      await enqueueWith(
        boss,
        "emailSend",
        email({ to: "tx@example.com", template: "magic-link", props: { url: "https://x.test/m?token=3" } }),
        { db: fromDrizzle(tx, sql) },
      );
    });
    await waitFor(() => sent.find((m) => m.to === "tx@example.com"));
  });
});

describe("durability (NFR-011)", () => {
  it("a scheduled job survives a worker crash and runs after the restart", async () => {
    // A reminder-like delayed job is stored in PostgreSQL…
    await enqueueWith(boss, "emailSend", email({ to: "later@example.com", template: "magic-link", props: { url: "https://x.test/m?token=4" } }), {
      startAfter: new Date(Date.now() + 3_000),
    });
    // …the worker dies abruptly before it is due (no graceful shutdown)…
    await boss.stop({ graceful: false, close: true });
    const [stored] = (await db.execute(sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name = ${QUEUES.emailSend.name} AND state = 'created'`)).rows as { n: number }[];
    expect(stored.n).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 3_500));
    expect(sent.some((m) => m.to === "later@example.com")).toBe(false);
    // …and a new worker delivers it.
    boss = await startWorker();
    await waitFor(() => sent.find((m) => m.to === "later@example.com"));
  });
});
