# Self-hosting

How OpenCalendar is packaged and run by operators: one image, one command, runtime configuration.

Last updated: 2026-09-29

Decision background: [ADR-0003](../adr/0003-self-host-first-single-app.md). Security controls
referenced here: [security.md](./security.md).

## Goals

1. **One command**: `docker compose up -d` gives a working instance with Postgres and a worker.
2. **No rebuilds for configuration.** Domain, SMTP, OAuth keys are runtime env vars. We never
   use `NEXT_PUBLIC_*` for deploy-specific values, because Next.js inlines them at `next build`
   (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`).
3. **Only Postgres** as a stateful dependency (no Redis) ([ADR-0005](../adr/0005-jobs-pg-boss-no-redis.md)).
4. **No license keys**, no phone-home ([ADR-0001](../adr/0001-license-agplv3.md)).
5. Upgrades are "pull new tag, restart"; migrations run automatically and are forward-only.

## Image

- Multi-stage Dockerfile, `node:24-alpine` runtime, non-root user `node`.
- Built with `output: 'standalone'`; `public/` and `.next/static` copied into the standalone
  folder so `server.js` serves them (Next.js `output.md`).
- Contains three entrypoints: `server.js` (web), `worker.js` (pg-boss worker bundle),
  `cli.js` (`migrate`, `rotate-keys`, `create-admin`).
- Default command: `node server.js`; migrations run on boot from `instrumentation.ts` (`MIGRATE_ON_START=true`), and `node cli.js migrate` is available for operators who disable that. `PORT` (default 3000) and
  `HOSTNAME=0.0.0.0` are honored by the standalone server.
- Published to `ghcr.io/kudretyilmazz/opencalendar:<version>` and `:latest`, multi-arch
  (amd64, arm64).

## Quick start (one command)

On a server with Docker and a DNS name pointing at it:

```bash
git clone https://github.com/kudretyilmazz/opencalendar.git && cd opencalendar
cp .env.example .env
# edit .env: APP_URL=https://cal.example.com, AUTH_SECRET and ENCRYPTION_KEY (openssl rand -base64 32),
#   POSTGRES_PASSWORD (openssl rand -hex 24 — it goes into a URL), and your SMTP settings
OPENCALENDAR_IMAGE=ghcr.io/kudretyilmazz/opencalendar:1 docker compose up -d --no-build
```

Without `OPENCALENDAR_IMAGE` the stack builds the image from the checkout instead (`docker compose
up -d --build`). The app listens on `127.0.0.1:3000`; put a TLS reverse proxy in front (see
[Reverse proxy](#reverse-proxy)) and **sign up immediately**: the first account becomes the
instance administrator. `node cli.js create-admin <email>` (`docker compose exec app node cli.js
create-admin you@example.com`) promotes another existing account later.

## docker-compose example

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: opencalendar
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: opencalendar
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opencalendar"]
      interval: 5s
      retries: 10

  app:
    image: ghcr.io/kudretyilmazz/opencalendar:1
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
    env_file: .env
    environment:
      DATABASE_URL: postgres://opencalendar:${POSTGRES_PASSWORD}@postgres:5432/opencalendar
      WORKER_MODE: external
    ports:
      - "127.0.0.1:3000:3000"                # only the local reverse proxy reaches it
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health/ready"]
      interval: 15s
      retries: 5

  worker:
    image: ghcr.io/kudretyilmazz/opencalendar:1
    restart: unless-stopped
    command: ["node", "worker.js"]
    depends_on:
      app: { condition: service_healthy }   # app runs migrations first
    env_file: .env
    environment:
      DATABASE_URL: postgres://opencalendar:${POSTGRES_PASSWORD}@postgres:5432/opencalendar

  mailpit:                                   # optional: dev/demo only
    image: axllent/mailpit:latest
    profiles: ["dev"]
    ports:
      - "8025:8025"                          # web UI; SMTP on 1025 inside the network

volumes:
  pgdata:
```

Tiny installs can drop the `worker` service and set `WORKER_MODE=inline`; the web process then
starts the pg-boss workers from `instrumentation.ts` `register()` (called once per server
instance before it handles requests). Not recommended with more than one web replica.

## Environment variables

All variables are read at **runtime** and validated by Zod in `lib/env.ts`; the process exits
with a readable error listing missing/invalid values.

| Variable | Required | Example / default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/opencalendar` | Postgres connection |
| `APP_URL` | yes | `https://cal.example.com` | Public base URL (links, OAuth callbacks, ICS, CSP); runtime, no rebuild |
| `AUTH_SECRET` | yes | 32+ random bytes | Better Auth signing secret; also encrypts stored sign-in OAuth tokens (changing it signs everyone out and those users sign in with Google/Microsoft again) |
| `ENCRYPTION_KEY` | yes | `openssl rand -base64 32` | AES-256-GCM key for credentials |
| `ENCRYPTION_KEY_PREVIOUS` | no | | Old key during rotation |
| `WORKER_MODE` | no | `external` | `external` (separate worker) or `inline` |
| `MIGRATE_ON_START` | no | `true` | Apply database migrations when the web process starts (see below) |
| `SMTP_HOST` | yes* | `smtp.example.com` | *Required for email; dev can use Mailpit |
| `SMTP_PORT` | no | `587` | |
| `SMTP_USER` / `SMTP_PASSWORD` | no | | SMTP auth |
| `SMTP_SECURE` | no | `false` | `true` for implicit TLS (465) |
| `SMTP_FROM` | yes* | `OpenCalendar <no-reply@example.com>` | Sender address |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | | Google login + Calendar/Meet (provider hidden if unset) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | no | | Microsoft login + Outlook/Teams |
| `MICROSOFT_TENANT_ID` | no | `common` | Restrict to one tenant |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | no | | Zoom meetings |
| `JITSI_BASE_URL` | no | `https://meet.jit.si` | Own Jitsi server |
| `SIGNUP_MODE` | no | `open` | `open`, `invite_only` (new people join only when a team invites their address; they create the account with an email sign-in link, not a password), `disabled` |
| `CAPTCHA` | no | `off` | `altcha` adds an invisible, self-hosted proof-of-work check (ALTCHA) to public booking; no third-party service (ADM-007) |
| `WEBHOOK_ALLOW_PRIVATE` | no | `false` | Allow webhook targets on private, loopback or link-local addresses and plain `http` (e.g. a LAN n8n) |
| `EMBED_ALLOWED_ORIGINS` | no | `*` | Space-separated origins allowed to frame booking pages in embed mode (`frame-ancestors`), e.g. `https://example.com https://*.example.org`; `none` disables embedding ([embeds](./embeds.md)) |
| `TRUSTED_PROXIES` | no | loopback + private ranges | CIDRs of reverse proxies whose `X-Forwarded-For` hops are trusted; the client IP is the right-most untrusted hop |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | multi-replica | base64 16/24/32 bytes | Consistent Server Action encryption across instances |
| `LOG_LEVEL` | no | `info` | `debug` ... `error`; JSON logs to stdout |
| `CALENDAR_POLL_SECONDS` | no | `300` | How often connected CalDAV calendars and ICS feeds are re-read (30–3600); Google/Microsoft at most every 2 minutes |
| `ALLOW_PRIVATE_NETWORK_INTEGRATIONS` | no | `false` | Allow CalDAV servers / ICS feeds on private or loopback addresses (LAN Nextcloud) |
| `METRICS_TOKEN` | no | | Enables `GET /api/metrics` (Prometheus text) for requests with `Authorization: Bearer <token>` (16+ chars) |
| `DATABASE_POOL_MAX` | no | `20` | Postgres connections per app process; keep replicas × this + worker below `max_connections` |
| `SOURCE_URL` | no | `https://github.com/kudretyilmazz/opencalendar` | Target of the "Source code" link in every page footer (AGPL-3.0 §13). **Point it at your fork if you modify OpenCalendar.** |
| `PORT` / `HOSTNAME` | no | `3000` / `0.0.0.0` | Standalone server bind |

Not yet available (later milestones): Stripe payments (`STRIPE_*`, M5), third-party CAPTCHA
providers such as Turnstile/hCaptcha, and a default UI language (i18n, M5).

Browser code that needs a config value (e.g. `APP_URL` for the embed snippet) receives it as a
prop from a Server Component or from `GET /api/config`, never from `process.env.NEXT_PUBLIC_*`.
Pages that read env directly are dynamic (or call `connection()` first) so values are not
frozen into prerendered HTML.

## Coolify

[`deploy/coolify/opencalendar.yaml`](../../deploy/coolify/opencalendar.yaml) is a ready-made
[Coolify](https://coolify.io) template (web, worker and PostgreSQL):

1. In Coolify: **New Resource → Docker Compose Empty**, paste the file and save.
2. Set `SMTP_HOST` and `SMTP_FROM` (plus `SMTP_USER`/`SMTP_PASSWORD`/`SMTP_PORT` if needed).
   Coolify marks them as required and will not deploy without them.
3. Give the `opencalendar` service a domain (Coolify generates one otherwise) and deploy.

Coolify generates `AUTH_SECRET`, the Postgres password and `ENCRYPTION_KEY`. The key uses
`SERVICE_REALBASE64_32_*` because it must decode to 32 bytes; Coolify's `SERVICE_BASE64_*` values
are plain random text despite the name. **Back the generated `ENCRYPTION_KEY` up**: without it,
stored calendar credentials cannot be decrypted. Coolify's proxy is on a private Docker network,
so the default `TRUSTED_PROXIES` already covers it. Sign up right after the first deploy: the first
account becomes the administrator.

## Reverse proxy and client IPs

Run OpenCalendar behind a reverse proxy (Caddy, nginx, Traefik, a load balancer) that **appends** the client address to `X-Forwarded-For`. Per-IP rate limits use the right-most hop that is not in `TRUSTED_PROXIES`, so values a client puts in the header itself are ignored. If the app port is exposed directly to the internet, clients can choose their apparent IP; per-account lockout still applies, but per-IP limits become weak. Set `TRUSTED_PROXIES` to your proxy's address range if it is not on a private network.

## First run

The first account created on an instance becomes its administrator, whatever `SIGNUP_MODE` is. Create your own account right after the first deploy (or deploy with the port closed until you have), then choose `SIGNUP_MODE`.

## Migrations on start

- `node cli.js migrate` runs Drizzle's programmatic `migrate()` against `db/migrations`
  (generated SQL + custom SQL such as the exclusion constraint), inside a Postgres advisory lock
  so parallel replicas do not race. pg-boss creates/upgrades its own `pgboss` schema when the
  worker starts.
- Migrations are **forward-only** and written to be compatible with the previous app version
  during a rolling restart (expand, migrate data, contract in a later release).
- `MIGRATE_ON_START=false` disables auto-migration for operators who run it as a separate step.

## Upgrades

1. Read the release notes (breaking changes are rare and flagged; see versioning in
   [api-and-webhooks.md](./api-and-webhooks.md#versioning-policy)).
2. Back up the database (below).
3. `docker compose pull && docker compose up -d`. The app migrates, then the worker starts.
4. Downgrades are not supported after a migration; restore the backup instead.

Supported path: any release to any later release within the same major version; across majors,
upgrade to the last minor of the previous major first.

## Backups

Everything (users, bookings, encrypted credentials, job queue) is in Postgres.

```bash
# nightly logical backup
docker compose exec -T postgres pg_dump -U opencalendar -Fc opencalendar > backup-$(date +%F).dump
# restore into an empty database
docker compose exec -T postgres pg_restore -U opencalendar -d opencalendar --clean --if-exists < backup-2026-09-28.dump
```

- **Restore drill (NFR-014):** `docker compose exec -T postgres pg_restore -U opencalendar -d opencalendar --clean --if-exists < backup.dump`, then restart `app` and `worker`. Run it against a scratch instance before every release.
- Restoring with a different `ENCRYPTION_KEY` does not corrupt anything, but queued emails and (from M2) stored credentials can't be decrypted: the worker logs `email.invalid_payload` and calendar connections show as errored until reconnected.
- **Back up `ENCRYPTION_KEY` separately** (password manager). Without it, calendar credentials
  in a restored database are unusable (users would have to reconnect).
- Larger installs: continuous archiving with WAL-G or pgBackRest, or a managed Postgres.

## Reverse proxy

- Terminate TLS at Caddy, Traefik or nginx; set `APP_URL` to the public https URL.
- Forward `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`. Next.js rejects
  Server Action POSTs whose `Origin` doesn't match `x-forwarded-host`/`host` (its CSRF check), so
  the proxy must pass the public host and the browser's `Origin` header through unchanged (Server
  Action requests with neither `Origin` nor `Sec-Fetch-Site` are refused as a CSRF backstop).
- `Strict-Transport-Security` is sent on pages when `APP_URL` is https; set it at the proxy too
  if you want it on every response.
- Disable response buffering for streaming (nginx: `proxy_buffering off;` or the
  `X-Accel-Buffering: no` header, per Next.js self-hosting guide).
- OAuth callbacks (`/api/integrations/*/callback`, `/api/auth/*`) must be reachable by the
  user's browser; nothing needs inbound traffic from third-party servers.

Caddy on the same host (automatic HTTPS; it appends the client address to `X-Forwarded-For`):

```text
cal.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Resource footprint

| Size | Users | web | worker | Postgres |
|---|---|---|---|---|
| Personal / family | 1-10 | 1 container, 512 MB RAM, 0.5 vCPU (`WORKER_MODE=inline` ok) | - | 256 MB, 1 GB disk |
| Small team | 10-200 | 1 GB RAM, 1 vCPU | 256 MB | 1 GB RAM, 5 GB disk |
| Organization | 200-2,000 | 2+ replicas, 1 GB each (shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `deploymentId`) | 2 replicas | 4 GB RAM, managed Postgres |

Targets for CI to enforce: image under 250 MB compressed, cold start under 5 s, idle web RSS
under 250 MB. Building the image must not require more than 4 GB of Node heap (Cal.com needed 12 GB).

Multiple web replicas: Next.js's default in-memory cache is per instance; we do not rely on
the Next.js data cache for correctness (busy cache and rate limits live in Postgres), so no
shared cache handler is required.

## Health checks

Implemented in M0 (ADM-004):

- `GET /api/health/live`: liveness, no dependencies. `200 { status: "ok" }`.
- `GET /api/health/ready` (alias `GET /api/health`): readiness. `SELECT 1` against Postgres and a check that the pg-boss schema is installed. `200 { status: "ok", checks: { database, jobQueue } }` or `503` with the failing check. Error details are reduced to the error class name so connection strings never leak.
- The image's Docker `HEALTHCHECK` uses `/api/health/live`; `docker-compose.yml` gates the worker on the app's `/api/health/ready`.

Planned (M2 observability, NFR-010):

- `migrations`: last applied migration matches the bundled journal.
- `worker`: heartbeat row every 30 s; older than 2 min reports `stale` without failing readiness.
- `node worker.js --health` for the worker container.
- Optional Prometheus metrics at `/api/metrics` protected by `METRICS_TOKEN` (queue depth,
  failed jobs, booking rate, provider error rate).
