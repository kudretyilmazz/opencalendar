# ADR-0004: Authentication with Better Auth (Drizzle adapter)

User authentication is provided by Better Auth, storing users and sessions in our Postgres via the Drizzle adapter.

Last updated: 2026-09-28

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** [../03-architecture/security.md](../03-architecture/security.md), [../03-architecture/data-model.md](../03-architecture/data-model.md)

## Context

We need: email + password, magic link, Google and Microsoft sign-in, database sessions that can be
revoked, and later SSO (OIDC/SAML) for M6. Everything must be self-hostable with no external
identity service. Cal.com used next-auth v4; Auth.js has since slowed down and its database
session story with the App Router has rough edges.

Verified in Better Auth docs (Context7, `/better-auth/better-auth`):

- `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }) })` from
  `better-auth/adapters/drizzle`.
- `emailAndPassword: { enabled, requireEmailVerification, sendResetPassword, ... }`.
- `socialProviders: { google: {...}, microsoft: {...} }` with client id and secret.
- `magicLink({ sendMagicLink })` plugin from `better-auth/plugins`.
- `nextCookies()` plugin from `better-auth/next-js` so Server Actions can set cookies
  (must be the last plugin).
- `toNextJsHandler(auth)` exported as `GET`/`POST` from `app/api/auth/[...all]/route.ts`.
- A separate `@better-auth/sso` plugin with an `ssoProvider` table for OIDC/SAML.
- The CLI (`npx auth@latest generate`) can generate the Drizzle schema for the core tables.

## Decision

- Use **Better Auth** with the **Drizzle adapter** (`provider: "pg"`).
- Enable email + password (with email verification), magic link, Google and Microsoft providers.
  Providers are enabled only when their env vars are present.
- Sessions are **database sessions** (table `session`) with an HTTP-only cookie; sessions can be
  listed and revoked in settings.
- Generate the Better Auth tables once with the CLI, then own them in `db/schema/auth.ts` and
  migrate with drizzle-kit like any other table.
- Keep **calendar OAuth separate from login OAuth**. Signing in with Google does not grant
  calendar scopes; connecting a calendar is an explicit flow that stores an encrypted
  `credential` row (see [integrations](../03-architecture/integrations.md)).
- Authorization (who may edit what) is our code, not Better Auth: every Server Action and route
  handler calls `requireUser()` and an ownership/role check.
- SSO (OIDC first, SAML later) via the Better Auth SSO plugin in M6.

## Consequences

### Positive

- Auth tables live in our database and migrations; no external IdP needed.
- Plugins cover M0-M6 needs (magic link, SSO, 2FA later).

### Negative

- Younger project than Auth.js; we must follow its security releases closely.
- Keeping generated schema in sync after upgrades is a manual review step.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Auth.js (next-auth v5) | Well known | Slower development, awkward DB sessions | Better Auth plugin set fits better |
| Lucia | Minimal | Deprecated as a library (now a guide) | Maintenance risk |
| Keycloak / Zitadel | Full IdP | Extra service for self-hosters | Violates single-app goal |
| Hand-rolled | Full control | Security risk | Not worth it |
