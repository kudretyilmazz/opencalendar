# ADR-0003: Self-host-first, single Next.js application and single Docker image

One Next.js 16 App Router application serves UI, public API and webhooks; one image runs as web or worker.

Last updated: 2026-09-28

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** [../03-architecture/system-overview.md](../03-architecture/system-overview.md), [../03-architecture/self-hosting.md](../03-architecture/self-hosting.md)

## Context

Research on Cal.com self-hosting ([../01-research/calcom.md](../01-research/calcom.md)) found:

- Two backends (Next.js + tRPC and a NestJS API v2) plus Redis for API v2.
- `NEXT_PUBLIC_WEBAPP_URL` and similar values baked in at build time, so changing the domain
  meant rebuilding the image.
- Community-maintained Docker images, upgrades that broke installs, a 12 GB Node heap for builds.

Next.js 16 (docs in `node_modules/next/dist/docs/`) gives us Server Actions for UI mutations,
Route Handlers for HTTP APIs, `output: 'standalone'` for small images, and `proxy.ts`
(the renamed `middleware`) running on the Node.js runtime.

## Decision

- **One application**: a single Next.js 16 App Router project. No separate API server.
  - UI mutations use **Server Actions**.
  - Public REST `/api/v1/*`, OAuth callbacks, inbound webhooks (Stripe, Google push) and
    `/api/health` use **Route Handlers** (`app/**/route.ts`).
- **One image**, built with `output: 'standalone'`. The same image runs:
  - `node server.js` (web), and
  - `node worker.js` (pg-boss worker, see [ADR-0005](./0005-jobs-pg-boss-no-redis.md)).
  - Tiny installs may set `WORKER_MODE=inline` to start the worker inside the web process
    via `instrumentation.ts` `register()`.
- **Runtime configuration only.** No configuration uses `NEXT_PUBLIC_*` (those are inlined at
  `next build`). Server code reads `process.env` through a Zod-validated `lib/env.ts`; client code
  receives the few values it needs (for example `APP_URL`) as props from Server Components.
- **Official** `docker-compose.yml` (app, worker, postgres, optional mailpit) is maintained in the
  repo and tested in CI on every release.
- Horizontal scaling is supported but not the default: multiple web replicas need a shared
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and a `deploymentId` (see Next.js self-hosting guide).

## Consequences

### Positive

- One codebase, one build, one image, one language (TypeScript).
- Changing domain or credentials only needs a restart.
- Shared domain services between Server Actions and REST handlers; no duplication.

### Negative

- Web and API scale together.
- Long-running work must never run in request handlers; the worker is required for reliability.
- We depend on Next.js release cadence and its security advisories.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Next.js UI + separate Fastify/Nest API | Clear API boundary | Two deployables, duplicated auth | Complexity for self-hosters |
| tRPC | End-to-end types | Extra layer; public API still needs REST | Server Actions cover internal RPC |
| SPA + Go backend | Small footprint | Two languages, slower feature work | Team velocity |
| Hosted-first SaaS | Easier ops | Contradicts self-host-first goal | Product positioning |
