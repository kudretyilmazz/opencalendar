# ADR-0005: Background jobs with pg-boss on PostgreSQL, no Redis

Reminders, webhook delivery, calendar sync and emails run as pg-boss jobs stored in the same PostgreSQL database.

Last updated: 2026-09-28

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** [ADR-0002](./0002-postgres-drizzle.md), [ADR-0003](./0003-self-host-first-single-app.md), [../03-architecture/system-overview.md](../03-architecture/system-overview.md)

## Context

We need durable delayed jobs (reminders days ahead), retries with backoff (webhooks), cron
(cleanup, cache refresh) and at-most-one-running for some jobs (per-calendar sync). Cal.com
used a mix of a "tasker", Trigger.dev, cron HTTP endpoints, and Bull + Redis for API v2,
which adds services self-hosters must run.

Verified in pg-boss docs (Context7, `/websites/deepwiki_timgit_pg-boss`):

- `boss.send(name, data, options)` with `retryLimit`, `retryDelay`, `retryBackoff`,
  `retryDelayMax`, `startAfter` (seconds, ISO string or Date), `singletonKey`,
  `expireInSeconds`, `deadLetter`.
- `boss.createQueue(name, options)`; queues must exist before `schedule()`
  (foreign key), and can declare a `deadLetter` queue.
- `boss.schedule(name, cron, data, { tz })` for cron schedules.
- `boss.work(name, { batchSize }, handler)` for workers.

## Decision

- Use **pg-boss** in its own schema (`pgboss`) in the application database.
- Producers (Server Actions, route handlers) call a thin `jobs/enqueue.ts` wrapper with typed
  payloads (Zod) per queue. Enqueue happens **after the business transaction commits**
  (or inside it using the same connection) so jobs never reference missing rows. **Verified in M0:**
  pg-boss 12 accepts `send(name, data, { db: fromDrizzle(tx, sql) })`, which enqueues inside the
  caller's Drizzle transaction (covered by `tests/integration/jobs.int.test.ts`), so no separate
  outbox table is needed.
- Consumers live in `jobs/<queue>.ts` and run in the **worker process** (`node worker.js`).
  `WORKER_MODE=inline` starts the same workers inside the web process for tiny installs.
- Queues: `email.send`, `reminder.fire`, `webhook.deliver`, `calendar.sync-booking`,
  `calendar.refresh-busy`, `payment.reconcile`, `booking.expire-pending`, `slot-hold.cleanup`,
  `maintenance.*` (see [system overview](../03-architecture/system-overview.md#background-jobs)).
- Every handler is **idempotent** (keyed by booking id + step) because pg-boss is at-least-once.
- Failed jobs past `retryLimit` go to a dead-letter queue and surface in the admin UI.
- Reminder jobs store their pg-boss job id in `scheduled_reminder` so reschedule/cancel can
  cancel them.

## Consequences

### Positive

- No Redis. Backups of Postgres include the job queue.
- Jobs can be enqueued in the same database as the business data.

### Negative

- Throughput is bounded by Postgres; fine for scheduling workloads (thousands of jobs/min),
  not for high-volume streaming.
- Polling-based workers add a small latency (seconds) to job pickup.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| BullMQ + Redis | Fast, mature UI | Extra service | Self-hosting cost |
| Graphile Worker | Postgres-based, LISTEN/NOTIFY | Smaller cron/singleton feature set for our needs | pg-boss API fits well; revisit if latency matters |
| Trigger.dev / Inngest | Great DX | External service or heavy self-host | Violates single-app goal |
| Cron HTTP endpoints | Simple | No retries, no durability | Unreliable |
