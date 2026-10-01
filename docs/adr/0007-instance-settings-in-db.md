# ADR-0007: Instance branding and settings live in the database

Last updated: 2026-10-01

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** maintainers
- **Related:** [ADM-009, ADM-011](../02-product/requirements.md), [ADR-0001](./0001-license-agplv3.md), [ADR-0003](./0003-self-host-first-single-app.md), [ADR-0005](./0005-jobs-pg-boss-no-redis.md)

## Context

Until now every instance-wide setting was a runtime environment variable (ADR-0003), and branding
("OpenCalendar", the favicon, the slate palette, the "Powered by" footer) was hardcoded. White-label
(ADM-011) and the admin area (ADM-009) need an instance administrator to change the app name, logo,
favicon, colors, email look, sign-up mode and similar settings from the UI, without a redeploy, and the
change has to reach every replica and the worker.

Uploaded images need storage. The only stateful service we run is PostgreSQL (ADR-0005); the
container runs as `node` with a read-only image and no data volume besides PostgreSQL's.

## Decision

We store instance settings in a single-row `instance_settings` table (`id = 1`, enforced by a CHECK
constraint) and uploaded branding images in an `instance_asset` table (`bytea`, one row per kind:
logo, dark logo, favicon, home-screen icon).

- Every settings column is nullable or has the old default, and **null means "use the built-in
  default"**. A fresh or upgraded instance looks exactly as before.
- Where an environment variable already existed (`SIGNUP_MODE`), **the database value wins when set,
  otherwise the variable applies**. Operators keep env-only setups; admins can override in the UI and
  go back to "Server default".
- Each process caches the resolved settings for 15 s (`features/instance/server/service.ts`, the same
  pattern as the public booking context). Saves clear the saving process's cache immediately; other
  replicas and the worker catch up within the TTL. Sign-up decisions read uncached.
- Images are served by `GET /api/branding/[kind]` with `?v=<hash>` URLs (immutable caching), a strict
  sandboxing CSP and `nosniff`. Uploads are checked by magic bytes and size, never by the client's
  file name or type.
- Theme colors are stored as validated `#rrggbb` values and rendered into a nonce'd `<style>`;
  foreground colors are derived (WCAG contrast), and colors too close to the page background are
  rejected (NFR-008).
- `SOURCE_URL` stays an environment variable: it is an operator obligation under AGPL §13, not a
  branding choice. Admins can hide the footer link, which then points to `/about`; `/about` always
  shows it (ADR-0001).

## Consequences

### Positive

- Branding changes apply without a redeploy and reach every replica, the worker and emails.
- Backups of PostgreSQL include the branding; nothing else needs persistent storage.
- Uncustomized instances are unchanged, so the upgrade needs no manual step (NFR-013).

### Negative

- Every page render reads the settings (cached), and the root layout is dynamic (it already was,
  because of the CSP nonce).
- Images in `bytea` are bounded to small files (favicon 256 KB, logo 1 MB); this is not a general
  file store.
- Two sources of truth for sign-up mode; the admin UI shows which one applies.

### Follow-ups

- Audit log of admin actions (ADM-010).
- Per-team logo uploads could reuse `instance_asset`'s serving route with a team-scoped table.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Environment variables only | No new tables | Needs redeploys; no uploads; not admin-editable | Doesn't meet ADM-011 |
| Key/value settings table | Flexible | Untyped; validation and defaults spread out | Typed columns match ADR-0002 |
| Images on a Docker volume | Simple file serving | New volume, permissions, shared storage for replicas | Breaks the PostgreSQL-only model |
| Images by URL only | No upload code | Depends on third-party hosting; mixed content risks | Poor admin experience |
