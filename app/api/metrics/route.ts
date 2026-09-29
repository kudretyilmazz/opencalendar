import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { gauge, slotLatency } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const rows = <T,>(result: { rows: unknown[] }) => result.rows as T[];

function authorized(request: Request, token: string): boolean {
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Prometheus metrics (NFR-010). Disabled unless METRICS_TOKEN is set; requires the bearer token. */
export async function GET(request: Request) {
  const token = getEnv().METRICS_TOKEN;
  if (!token) return new Response("Not found", { status: 404 });
  if (!authorized(request, token)) return new Response("Unauthorized", { status: 401 });

  const db = getDb();
  const [bookings, queues, syncErrors, invalid] = await Promise.all([
    db.execute(sql`SELECT status::text AS status, count(*)::int AS n FROM booking GROUP BY status`),
    db.execute(sql`SELECT name, state::text AS state, count(*)::int AS n FROM pgboss.job WHERE state IN ('created','retry','active','failed') GROUP BY name, state`),
    db.execute(sql`SELECT count(*)::int AS n FROM booking_reference WHERE status = 'failed'`),
    db.execute(sql`SELECT count(*)::int AS n FROM credential WHERE invalid_at IS NOT NULL`),
  ]);
  const body = [
    gauge("opencalendar_bookings", "Bookings by status", rows<{ status: string; n: number }>(bookings).map((r) => ({ labels: { status: r.status }, value: r.n }))),
    gauge(
      "opencalendar_job_queue_jobs",
      "Background jobs by queue and state",
      rows<{ name: string; state: string; n: number }>(queues).map((r) => ({ labels: { queue: r.name, state: r.state }, value: r.n })),
    ),
    gauge("opencalendar_calendar_sync_errors", "Booking references whose sync failed", [{ value: rows<{ n: number }>(syncErrors)[0]?.n ?? 0 }]),
    gauge("opencalendar_invalid_credentials", "Calendar/video connections needing reconnection", [{ value: rows<{ n: number }>(invalid)[0]?.n ?? 0 }]),
    slotLatency().render(),
  ].join("\n\n");
  return new Response(`${body}\n`, { headers: { "content-type": "text/plain; version=0.0.4", "cache-control": "no-store" } });
}
