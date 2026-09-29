# ADR-0002: PostgreSQL 16 with Drizzle ORM and typed columns

PostgreSQL 16 is the only supported database; the schema is defined in Drizzle and migrated with drizzle-kit.

Last updated: 2026-09-28

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** [../03-architecture/data-model.md](../03-architecture/data-model.md), [ADR-0005](./0005-jobs-pg-boss-no-redis.md)

## Context

- Scheduling needs strong consistency: two people must never book the same slot. PostgreSQL
  offers range types (`tstzrange`), GiST exclusion constraints and advisory locks, which let the
  database itself enforce "no overlapping bookings".
- We want one stateful dependency for self-hosters. PostgreSQL can also be the job queue
  (see [ADR-0005](./0005-jobs-pg-boss-no-redis.md)).
- Cal.com stores many settings as untyped JSON (`locations`, `bookingFields`, `bookingLimits`,
  `metadata`), which makes queries, validation and migrations fragile. We want typed columns and
  child tables where the data is queried or validated.
- Cal.com uses Prisma plus Kysely for raw queries. We want one tool that is close to SQL,
  fully typed, with no binary engine and no code generation step at runtime.

## Decision

- **PostgreSQL 16+** is the only supported database. No SQLite or MySQL.
- **Drizzle ORM** (`drizzle-orm/node-postgres`) for queries; schema in `db/schema/*.ts`.
- **drizzle-kit generate** creates SQL migrations that are committed to `db/migrations/`.
  Features drizzle-kit does not model (for example `EXCLUDE USING gist`, `btree_gist` extension)
  go into **custom migrations** created with `drizzle-kit generate --custom`.
- Migrations run at container start through the programmatic `migrate()` function
  (see [self-hosting](../03-architecture/self-hosting.md)).
- Timestamps are `timestamp with time zone` storing UTC instants. Local wall times for schedule
  rules are `time` columns plus an IANA time zone column.
- Enums are `pgEnum`. JSON (`jsonb`) is allowed only for opaque, never-queried data (for example
  raw provider responses), and must be validated with Zod on read and write.
- Zod schemas for inputs live next to features; database row types are inferred from Drizzle.

## Consequences

### Positive

- Double-booking protection at the database level (see data-model).
- Typed rows end to end; no runtime code generation; plain SQL migrations are reviewable.
- One database to back up.

### Negative

- Custom SQL migrations must be written and reviewed by hand for exclusion constraints.
- Drizzle has a smaller ecosystem than Prisma; fewer ready-made admin tools.
- Postgres-only rules out "single binary with SQLite" deployments.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Prisma | Popular, good DX | Codegen step, weaker raw SQL story, no exclusion constraints in schema | Drizzle closer to SQL |
| Kysely only | Great SQL builder | No schema/migration generator | Drizzle gives both |
| SQLite support | Tiny installs | No exclusion constraints/advisory locks, two dialects to test | Consistency first |
| MySQL | Widespread | No range types or exclusion constraints | Same |
