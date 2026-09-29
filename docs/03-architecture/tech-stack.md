# Tech stack

The libraries and tools OpenCalendar is built on, why each was chosen, and what else was considered.

Last updated: 2026-09-28

Guiding constraints: **one app, one image, one database** ([ADR-0003](../adr/0003-self-host-first-single-app.md)),
typed data end to end, and runtime configuration so a self-hoster never rebuilds the image.
See [system-overview.md](./system-overview.md) for how the pieces fit together.

## Stack table

| Layer | Choice | Why | Alternatives considered |
|---|---|---|---|
| Language | TypeScript 5 (strict) | One language for UI, API, worker, engine | Go backend + TS UI |
| Runtime | Node.js 22 LTS (Next.js 16 needs >= 20.9) | Required by Next.js 16; `proxy.ts` runs on Node.js runtime only | Bun (not officially supported by all deps) |
| Web framework | Next.js 16.3 App Router, React 19.2 | RSC pages, Server Actions, Route Handlers in one app; `output: 'standalone'` | Remix/React Router 7, SvelteKit, Next + NestJS (Cal.com) |
| Internal mutations | Server Actions | No extra RPC layer; built-in Origin check against CSRF | tRPC (Cal.com) |
| Public HTTP | Route Handlers (`app/api/**/route.ts`) | REST `/api/v1`, OAuth callbacks, inbound webhooks, health | Separate Fastify server |
| Request pre-processing | `proxy.ts` (Next 16 rename of `middleware`) | Security headers, CSP nonce, locale detection; Node.js runtime | None (built-in) |
| Database | PostgreSQL 16 | Range types, exclusion constraints, advisory locks, also hosts the job queue | MySQL, SQLite |
| ORM / migrations | Drizzle ORM + drizzle-kit | SQL-like, typed, no codegen engine; custom SQL migrations for exclusion constraints | Prisma, Kysely |
| Validation | Zod | One schema for env, forms, API bodies and OpenAPI | Valibot, ArkType |
| Auth | Better Auth (Drizzle adapter) | Email+password, magic link, Google/Microsoft, SSO plugin, DB sessions | Auth.js v5, Lucia, Keycloak |
| Jobs | pg-boss | Durable delayed jobs, retries with backoff, cron, dead letter; Postgres only | BullMQ + Redis, Graphile Worker, Trigger.dev |
| Email | Nodemailer (SMTP) + React Email | Any SMTP server; typed, previewable templates | Resend/Postmark SDKs (optional adapters later) |
| ICS | `ics` library | Generate VEVENT for invites and CalDAV writes | Hand-written iCal strings |
| CalDAV | tsdav | Maintained, typed CalDAV client; iCloud/Fastmail/Nextcloud tested | node-dav, custom WebDAV |
| iCalendar parsing | ical.js | RRULE/EXDATE/RECURRENCE-ID expansion and VTIMEZONE support for CalDAV objects and ICS feeds | node-ical, rrule |
| Outbound HTTP to user URLs | undici `Agent` with a checked DNS lookup | SSRF guard that re-checks addresses at connect time (DNS rebinding) | Pre-resolve only (racy), egress proxy |
| Dates / time zones | date-fns 4 + `@date-fns/tz` | Tree-shakeable, `TZDate` for IANA zones, DST-aware | Luxon, Day.js (Cal.com), Temporal (not yet everywhere) |
| Styling | Tailwind CSS 4 | Already in scaffold; CSS-first config, themeable via CSS variables | CSS Modules |
| Components | Small owned primitives (`components/ui`), shadcn/ui (Radix) planned when richer widgets (dialogs, popovers) are needed | Owned source, accessible, easy white-labeling | MUI, Mantine |
| Theming | Own light/dark/system provider + `next/script` (`beforeInteractive`, CSP nonce) | No flash of wrong theme; avoids React 19's client-rendered `<script>` warning seen with `next-themes` | next-themes |
| i18n | next-intl (en, tr at launch) | App Router + RSC support, ICU messages | next-i18next (Pages era) |
| Unit tests | Vitest | Fast, ESM, TS native; engine tests run in ms | Jest |
| Integration tests | Testcontainers (Postgres 16) | Real Postgres for constraints, pg-boss, Drizzle | pg-mem (no GiST support) |
| E2E | Playwright | Booker flows, embeds, multi-browser | Cypress |
| Dev mail | Mailpit | Catches all SMTP in dev and demo installs | MailHog (unmaintained) |
| Packaging | Single Docker image (standalone), docker-compose | `node server.js` or `node worker.js` from the same image | Helm-first, separate images |
| Secrets at rest | AES-256-GCM with `ENCRYPTION_KEY` (Node `crypto`) | Encrypt OAuth tokens/CalDAV passwords; key versioning for rotation | libsodium, KMS (optional later) |
| Lint/format | ESLint (flat config, `eslint` CLI) + Prettier | Next 16 removed `next lint`; use ESLint CLI directly | Biome |

## Version policy

- Pin exact versions in `package.json`; Renovate groups minor/patch updates weekly.
- Next.js security releases are applied within 72 hours (Cal.com self-hosters were exposed to
  Next.js advisories because of slow upgrades; see [../01-research/calcom.md](../01-research/calcom.md)).
- PostgreSQL: 16 is the tested baseline; 17 is tested in CI as "supported".

## Next.js 16 notes that shape the stack

Checked against the bundled docs in `node_modules/next/dist/docs/`:

- `middleware.ts` is deprecated and renamed **`proxy.ts`** with an exported `proxy` function; it
  runs on the Node.js runtime only (`01-app/03-api-reference/03-file-conventions/proxy.md`,
  `01-app/02-guides/upgrading/version-16.md`).
- `serverRuntimeConfig` / `publicRuntimeConfig` were removed. `NEXT_PUBLIC_*` values are inlined
  at build time, so we never use them for deploy-specific config; server code reads
  `process.env` at request time (use `connection()` where a page could otherwise be prerendered)
  (`01-app/02-guides/environment-variables.md`, `01-app/02-guides/self-hosting.md`).
- Route Handlers are **not cached by default** (`01-app/01-getting-started/15-route-handlers.md`).
- Caching is opt-in via **Cache Components** (`cacheComponents: true`, `'use cache'`,
  `cacheLife`, `cacheTag`). We start with it **off** for M0-M1 and evaluate it for public
  booking pages later (see [ADR index](../adr/README.md), candidate ADR).
- Server Actions compare `Origin` to host (`x-forwarded-host`/`host`) to block CSRF; extra hosts
  go in `experimental.serverActions.allowedOrigins`
  (`01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`).
- `next lint` was removed in 16; run ESLint directly.

## Related ADRs

- [ADR-0001 License AGPLv3](../adr/0001-license-agplv3.md)
- [ADR-0002 PostgreSQL + Drizzle](../adr/0002-postgres-drizzle.md)
- [ADR-0003 Self-host-first single app](../adr/0003-self-host-first-single-app.md)
- [ADR-0004 Better Auth](../adr/0004-auth-better-auth.md)
- [ADR-0005 pg-boss, no Redis](../adr/0005-jobs-pg-boss-no-redis.md)
- [ADR-0006 CalDAV-first calendars](../adr/0006-caldav-first-calendar-strategy.md)
