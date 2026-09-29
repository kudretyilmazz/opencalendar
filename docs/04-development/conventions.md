# Coding Conventions

The rules every contribution to OpenCalendar follows.

Last updated: 2026-09-28

## Folder structure (feature-based)

```
app/                      # Next.js routes only (thin: parse input → call feature → render)
  (marketing)/            # landing, docs links
  (auth)/                 # sign-in, sign-up
  (dashboard)/            # host UI: event types, availability, bookings, settings
  [user]/[eventSlug]/     # public booking pages
  api/v1/                 # public REST API (Route Handlers)
  api/integrations/       # OAuth callbacks, provider webhooks
  embed/                  # embed-specific routes
features/<domain>/        # event-types, availability, bookings, teams, routing, workflows, webhooks …
  server/                 # server actions, services, repositories (DB access)
  components/             # React components for this domain
  schemas.ts              # Zod schemas (shared by forms, actions, API)
lib/
  availability/           # PURE slot engine — no I/O, no framework imports
  integrations/<provider>/# adapters implementing CalendarAdapter / ConferencingAdapter / PaymentAdapter
  email/ ics/ crypto/ env.ts
db/
  schema/*.ts             # Drizzle tables, one file per domain
  migrations/
jobs/                     # pg-boss job definitions + worker entry
components/ui/            # shadcn/ui primitives
```

**Dependency rule:** `app → features → lib → (nothing app-specific)`. `lib/availability` must never import from `db`, `features` or `next`. See [system overview](../03-architecture/system-overview.md).

## TypeScript

- `strict` mode; no `any` (use `unknown` + narrowing). No non-null `!` except in tests.
- Validate every boundary with Zod: env, form input, server action args, API bodies, webhook payloads, provider responses.
- Prefer `type` for data shapes and discriminated unions for states (e.g. `BookingStatus`).
- **Immutability:** never mutate inputs. Return new objects and arrays (`{ ...x, field }`, `toSorted`, `map`). The availability engine is fully functional.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `event-type-form.tsx` |
| Components | PascalCase | `EventTypeForm` |
| Functions / vars | camelCase | `getAvailableSlots` |
| DB tables / columns | snake_case (Drizzle maps them) | `event_type.min_notice_minutes` |
| Env vars | SCREAMING_SNAKE | `ENCRYPTION_KEY` |
| Requirement refs | `AREA-NNN` | `BKG-004` in commits, PRs and tests |

## Time and dates

- Store instants as `timestamptz` in UTC. Store schedule rules as local wall time plus an IANA timezone.
- Never use `new Date()` directly in domain code. Inject a `now` (or a clock) so tests are deterministic.
- Use `date-fns` + `@date-fns/tz`. Never do manual offset math.

## Server code

- Every server action and route handler must, in order: (1) authenticate, (2) validate input with Zod, (3) **authorize ownership** (the resource belongs to the user or the user's team), (4) call a service, (5) return a typed result.
- Result envelope for API: `{ data, error, meta }`. Server actions return `{ ok: true, data } | { ok: false, error }`.
- Errors: throw typed domain errors in services and map them to user-friendly messages at the edge. Never swallow errors; log with context server-side.
- Keep functions under ~50 lines, files under ~400 (800 hard max), and nesting ≤ 4 levels.

## Next.js 16

- Read `node_modules/next/dist/docs/` before using framework APIs. Conventions changed since earlier versions (for example the middleware file and caching). The architecture docs note the specifics we rely on.
- Default to Server Components. Add `"use client"` only for interactive leaves (slot picker, forms).

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`. Reference requirement IDs, e.g. `feat(booking): cancel via link (BKG-012)`.
- Branch from `main` using `feat/<short-name>` or `fix/<short-name>`. Open a PR, CI must be green, and one review is required.
- Each PR adds or updates tests and updates docs when behavior changes.

## Definition of done

- [ ] Tests written first (TDD) and passing; coverage ≥ 80% for touched code (≥ 90% for `lib/availability`)
- [ ] `npm run lint && npm run typecheck && npm test` green
- [ ] Authorization tested (a user cannot read or modify another user's resources)
- [ ] No secrets in code; inputs validated
- [ ] i18n strings externalized (from M5 on; keep them centralized before that)
- [ ] Docs and requirement status updated
