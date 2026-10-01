# Architecture Decision Records

Index of accepted and proposed architecture decisions for OpenCalendar.

Last updated: 2026-09-28

We use a lightweight [MADR](https://adr.github.io/madr/) format. Copy
[0000-template.md](./0000-template.md) for new decisions, number sequentially, and open a PR.
Decisions are never deleted; they are superseded by a newer ADR.

| # | Title | Status | Date |
|---|---|---|---|
| [0000](./0000-template.md) | ADR template | n/a | 2026-09-28 |
| [0001](./0001-license-agplv3.md) | License under AGPLv3, no enterprise edition split | Accepted | 2026-09-28 |
| [0002](./0002-postgres-drizzle.md) | PostgreSQL 16 with Drizzle ORM and typed columns | Accepted | 2026-09-28 |
| [0003](./0003-self-host-first-single-app.md) | Self-host-first, single Next.js app and Docker image | Accepted | 2026-09-28 |
| [0004](./0004-auth-better-auth.md) | Authentication with Better Auth (Drizzle adapter) | Accepted | 2026-09-28 |
| [0005](./0005-jobs-pg-boss-no-redis.md) | Background jobs with pg-boss, no Redis | Accepted | 2026-09-28 |
| [0006](./0006-caldav-first-calendar-strategy.md) | CalDAV-first calendar strategy with Google/Microsoft adapters | Accepted | 2026-09-28 |
| [0007](./0007-instance-settings-in-db.md) | Instance branding and settings live in the database | Accepted | 2026-10-01 |

## Candidate future ADRs

- Video: default conferencing provider (Jitsi link vs. none) for fresh installs.
- SMS provider abstraction (M6).
- Multi-tenant hosted mode (organizations, subdomains).
- Choosing `cacheComponents` (Next.js Cache Components) for public booking pages.
