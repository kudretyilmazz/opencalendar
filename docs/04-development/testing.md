# Testing Strategy

What we test, with which tools, and the coverage we require.

Last updated: 2026-09-28

## Principles

- **TDD by default:** write a failing test (RED), implement (GREEN), then refactor.
- **The scheduling core is the product.** A wrong slot or a double booking is our worst possible bug, so the availability engine and the booking transaction get the deepest testing.
- **Deterministic time:** inject `now`; never depend on the machine timezone. CI runs with `TZ=UTC`, and one extra CI job runs with `TZ=America/New_York` to catch hidden local-time bugs.
- **Authorization is tested explicitly.** Cal.com Cloud's January 2026 incident was chained access-control bugs (see [Cal.com analysis](../01-research/calcom.md)). Every mutation needs a "different user cannot do this" test.

## Test pyramid

| Layer | Tool | Scope | Target |
|---|---|---|---|
| Unit | Vitest | `lib/availability`, `lib/ics`, Zod schemas, pure helpers, adapters with mocked HTTP | ≥ 90% for `lib/availability`, ≥ 80% overall |
| Integration | Vitest + Testcontainers (Postgres 16) | Services and repositories, server actions, `/api/v1` route handlers, migrations, double-booking constraint, pg-boss jobs | Critical paths |
| E2E | Playwright | Real browser against `next build && next start` + test DB + Mailpit | Critical user flows |
| Contract | Vitest + recorded fixtures | Google, Microsoft Graph, CalDAV, Stripe responses | Each adapter |

## Availability engine test matrix

Specified in detail in [availability engine](../03-architecture/availability-engine.md). At minimum:

- Weekly rules across DST transitions (`America/New_York` spring forward and fall back; `Europe/Istanbul`, which has no DST).
- Booker and host in different timezones, including a date line crossing (`Pacific/Auckland` ↔ `America/Los_Angeles`).
- Date override that replaces a day, that empties a day, and that adds hours on a normally-off day.
- Buffers before and after that overlap adjacent bookings.
- Minimum notice, booking horizon (rolling and fixed).
- Slot interval ≠ duration, and a duration that doesn't fit the remaining range.
- Seats: partially full vs full.
- Collective (intersection) and round robin (union), including a host with no schedule.
- Limits reached (day, week, month) → whole period blocked.
- `rescheduleUid` excludes the booking being moved.
- Explainability: every removed slot has the correct reason code.
- Performance: 30-day window, 5 hosts, 500 busy intervals in under 50 ms on CI hardware.

Use **property-based tests** (`fast-check`) for interval algebra invariants: `subtract(a, b) ∩ b = ∅`, `union` is idempotent and commutative, and results are always normalized (sorted, non-overlapping).

## Booking concurrency tests (integration)

- Two parallel `createBooking` calls for the same slot and host → exactly one succeeds, the other gets `SLOT_TAKEN`.
- Seated event with 1 seat left and 2 parallel requests → one succeeds.
- An idempotency key replayed → same booking returned, no duplicate emails.

## Critical E2E flows

1. Sign up → create schedule → create event type → public page shows expected slots.
2. Book as a guest → confirmation page → email with ICS in Mailpit → booking appears in the dashboard.
3. Reschedule via email link → old slot freed, new slot booked, emails sent.
4. Cancel via email link → status cancelled, slot freed.
5. (M3) Requires confirmation → host accepts → booker notified.
6. (M3) Embed inline on a test HTML page → booking → `postMessage` event received.
7. (M4) Round robin → booking assigned to the correct host (`tests/e2e/teams.spec.ts`, plus `routing-forms.spec.ts` for routing forms).
8. Booker in a different timezone sees correctly converted times.

### E2E environment variables
| Variable | Default | Purpose |
|---|---|---|
| `E2E_BASE_URL` | unset → starts `npm run dev` on :3000 | Run against a deployed stack, e.g. `http://localhost:3300` |
| `MAILPIT_URL` | `http://localhost:8025` | Where the tests read emails |
| `E2E_DATABASE_URL` / `DATABASE_URL` | – | Needed to reset auth rate limits between sign-ups, and for the routing-form test's check that the booking is linked to the response |
| `E2E_CALDAV_URL` | `http://localhost:5232` | Radicale as seen by the test runner |
| `E2E_CALDAV_APP_URL`, `E2E_HOST_FROM_APP` | same as above / `localhost` | Radicale and the local ICS feed as seen by the app (use `host.docker.internal` when the app runs in Docker) |
| `METRICS_TOKEN` | dev token | Bearer token for `/api/metrics` |

The app must run with `ALLOW_PRIVATE_NETWORK_INTEGRATIONS=true` for the CalDAV/ICS flows (Radicale is on a private address).

## Load tests (NFR-001, NFR-002)
`scripts/loadtest.ts` seeds a host (30-day window, 60 bookings, 400 cached calendar events) and runs autocannon with 100 connections for 20 s against `/api/public/slots`. It fails unless p97.5 < 300 ms and p99 < 800 ms with no errors.

`scripts/loadtest-team.ts` (NFR-002) seeds a team of 10 hosts in 5 time zones (20 bookings and 200 cached calendar events each) with a round-robin and a collective event type, then runs autocannon with 20 connections for 20 s against each over a 30-day window. It fails unless p97.5 (≥ p95) < 800 ms with no errors. Both need `DATABASE_URL`, `ENCRYPTION_KEY` (the app's) and `BASE_URL`.

## CI pipeline

```
lint → typecheck → unit (TZ=UTC) → unit (TZ=America/New_York) → integration (Postgres service) → build → e2e (critical flows)
```

PRs must be green. Coverage is reported per package, and dropping below the thresholds fails CI.

## Test data

- Factories (`tests/factories/*`) that build typed objects with sensible defaults. Never share mutable fixtures.
- Each integration test runs in a transaction that is rolled back, or on a fresh schema.
- Seeds in `db/seed.ts` exist only for local demos, never for tests.
