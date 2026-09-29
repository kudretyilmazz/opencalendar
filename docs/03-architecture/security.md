# Security

Threat model, authentication and authorization rules, and the controls OpenCalendar relies on.

Last updated: 2026-09-28

Motivation: in January 2026 an AI-driven scanner found three chained **access-control bugs** in
Cal.com Cloud, and Cal.com cited AI-accelerated vulnerability discovery when it closed its source
in April 2026 ([../01-research/calcom.md](../01-research/calcom.md)). We take the opposite
approach: stay open, and make authorization boring, centralized and tested. Every resource-level
permission has an automated test that proves a different user **cannot** access it.

## Threat model summary

| Asset | Threat | Primary controls |
|---|---|---|
| Other users' bookings, attendee PII | IDOR / broken access control via Server Actions or API | Central `authorize()` helpers, ownership in every query, negative tests |
| Calendar/video/payment credentials | DB dump or backup leak | AES-256-GCM encryption, key outside DB, never logged |
| Sessions | Session theft, CSRF | HTTP-only `SameSite=Lax` secure cookies, Server Action Origin check, 7-day sessions |
| Public booking endpoints | Spam, slot exhaustion, email bombing | Rate limits, bot checks, email verification option, holds expire |
| Webhooks / CalDAV / ICS URLs | SSRF to internal network or cloud metadata | SSRF-safe fetch, IP allow/deny, no redirects |
| Embeds | Clickjacking of dashboard, postMessage data leaks | `frame-ancestors` per route, origin-validated messages |
| Supply chain | Malicious dependency | Lockfile, pinned versions, audit and scanning in CI |
| Admin | Privilege escalation | Separate `role=admin`, audit log, re-auth for sensitive actions |
| Availability explanation | Leak of calendar event titles | Owner-only; never for anonymous bookers |

Out of scope for v1: malicious instance operators (they own the database and key), and
compromised end-user devices.

## Authentication

- Better Auth ([ADR-0004](../adr/0004-auth-better-auth.md)): email + password (min 10 chars;
  no breached-password check yet), magic link, Google/Microsoft OAuth; SSO in M6.
- Database sessions, cookie `HttpOnly; Secure; SameSite=Lax`; a session ends after 7 days
  without use (each day of use extends it). All sessions are revoked on password reset; a
  session list with "sign out everywhere" in settings is planned (not in 1.0).
- Sign-in OAuth tokens (Google/Microsoft login) are stored encrypted (`encryptOAuthTokens`).
- Login and magic-link requests rate limited per IP and per email; generic responses
  ("if an account exists ...") to prevent enumeration.
- Optional TOTP 2FA (Better Auth plugin) in M6; required for instance admins when enabled.
- Attendees do not have accounts. Cancel/reschedule links contain the booking `uid` plus a
  random 256-bit manage token; only its SHA-256 hash is used for lookups (constant-time compare).
  A sealed (AES-GCM) copy is kept so reminder emails can repeat the link (NTF-005). Seats have
  their own tokens. Host accept/reject links in emails are HMAC-signed and expire.

## Authorization

Rules (also in [system-overview.md](./system-overview.md#module-boundaries-and-dependency-rules)):

1. **Every** Server Action and Route Handler begins with `const actor = await requireActor()`
   (session user or API key) unless explicitly listed as public in `lib/auth/public-routes.ts`.
   Next.js docs are explicit that a Server Action "runs as a POST request" reachable by anyone
   and that render-time gating "is not a security boundary"
   (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, Security section).
2. Resource access goes through `authorize(actor, action, resource)` in `lib/auth/permissions.ts`,
   which loads the resource **with its owner/team** and checks:
   - personal resources: `resource.owner_user_id === actor.userId`;
   - team resources: membership exists, `accepted`, and role allows the action.
3. Repositories take an `actor`-scoped filter (`where owner_user_id = $actor or team_id in $actorTeams`)
   so a missing check fails closed (returns not found) rather than open.
4. IDs from the client are never trusted to imply ownership (e.g. `eventTypeId` in a
   create-host action must be re-checked against the actor's teams).
5. Return `404` (not `403`) for resources in other tenants to avoid existence leaks.

Team role matrix (M4, as built — `features/teams/server/access.ts` `requireTeamRole`):

| Action | member | admin | owner |
|---|---|---|---|
| See the team, its members, event types and the availability view (busy blocks only, no titles) | yes | yes | yes |
| See and manage bookings they host (organizer or collective co-host) | yes | yes | yes |
| Create/edit team event types, hosts, managed assignments, routing forms, team workflows | no | yes | yes |
| Invite members/admins, cancel invitations, change member ↔ admin, remove members/admins | no | yes | yes |
| Invite or appoint owners, remove/demote owners, delete the team | no | no | yes |

- Non-members get **NOT_FOUND**, members below the needed role **FORBIDDEN** (pages show 404).
  Ids from forms are always re-scoped (`and(id, team_id)`), including workflows and routing forms.
- The last owner can't be demoted or removed; roles are read under a row lock on the team's
  memberships, so concurrent changes can't race past the check.
- A team event type's `owner_user_id` is only its creator and grants nothing: personal workflow
  APIs refuse team event types, so a demoted or removed creator can't attach a workflow that
  mails booking data out. Their personal workflows on team types are deleted when they leave.
- Invitations: creating teams and sending invitations needs a verified email and is rate-limited
  (30 invitations/hour per sender, ≤ 100 pending per team). Accepting needs the signed-in user's
  *verified* email to match; the invitation grants at most the sender's current role. Account
  pre-hijack (sign up first with someone else's address) is covered by Better Auth: OAuth never
  links to an unverified local account, and magic-link/OTP verification deletes the unproven
  password (regression test in `tests/integration/auth.int.test.ts`).
- Dynamic group links (`/a+b`) resolve only when every person opted in
  (`profile_settings.allow_dynamic_group`, default off) **and** they share a team, so the URL is
  not an oracle for private team membership and nobody is booked into a group without consent.
- Routing forms: submissions are rate-limited per IP (20/min) and per form (500/h); the headless
  GET route doesn't store responses for prefetch/prerender requests; a routing response links to
  at most one booking. `external_url` targets are https only but not allow-listed (a form owner
  can send visitors to any https site — see "known gaps").

**Authorization test suite:** `tests/integration/teams.int.test.ts` and
`teams-admin.int.test.ts` exercise every team service (settings, members, invitations, roles,
event types, hosts, managed types, workflows, availability view, removal) for owner, admin,
member and outsider; `routing-forms.int.test.ts` does the same for routing forms and the CSV
export. (The generated matrix over every Server Action described in the original plan is not
built; the service-level suites cover the same checks.)

Known gaps (accepted for M4): a team logo URL is loaded by visitors' browsers from its host (like
any external image); routing-form external redirects are not allow-listed; managed event types
are published on members' pages without an explicit acceptance step (as in Cal.com).

## CSRF

- Server Actions: Next.js compares the request `Origin` host to the app host (`x-forwarded-host`
  or `host`) and rejects mismatches; additional hosts go in
  `experimental.serverActions.allowedOrigins`. A request **without** an `Origin` header is
  allowed with a warning (`serverActions.md`), so `proxy.ts` additionally rejects Server Action
  POSTs (`Next-Action` header) that carry neither `Origin` nor `Sec-Fetch-Site: same-origin`.
- Reverse proxies must forward `X-Forwarded-Host` (see [self-hosting.md](./self-hosting.md#reverse-proxy)).
- Route Handlers with cookie auth (`/api/auth/*`) rely on Better Auth's origin checks
  (`trustedOrigins` = `APP_URL`). `/api/v1` uses bearer tokens only and ignores cookies.
- OAuth `state` + PKCE for integration connects ([integrations.md](./integrations.md#oauth-flow-and-token-refresh)).

## Input validation

- Zod at every boundary: env (`lib/env.ts`, fail fast at startup), Server Action inputs, API
  bodies and queries, webhook/provider responses, `jsonb` columns on read.
- Limits: string max lengths, array max sizes, request body size (Server Actions
  `bodySizeLimit` default kept small; uploads are not supported in v1).
- Output encoding by React; user markdown (event descriptions) rendered with a sanitizing
  renderer (no raw HTML). Email templates escape all variables.
- Parameterized queries only (Drizzle); `sql` template tag, never string concatenation.

## Secrets and credential encryption

- Required secrets: `AUTH_SECRET` (Better Auth), `ENCRYPTION_KEY` (32 bytes base64). Startup
  fails if missing or too short. Optional `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for multi-replica.
- Integration credentials, webhook secrets and CalDAV passwords are encrypted with
  **AES-256-GCM**, random IV, AAD = row id ([integrations.md](./integrations.md#credential-encryption)).
  Keys that aren't random (e.g. zero-filled) are refused at startup in production.
- **Key rotation**: set the new `ENCRYPTION_KEY`, move the old one to `ENCRYPTION_KEY_PREVIOUS`,
  restart, run `node cli.js rotate-keys` (re-encrypts credentials, webhook secrets, private-link
  tokens and sealed booking tokens; idempotent), wait a few minutes for queued jobs, then remove
  the previous key.
- API keys and single-use link tokens are stored as SHA-256 hashes; passwords via Better Auth's
  hashing (scrypt).
- Logs: JSON lines with codes and ids only — error messages, tokens, emails and payloads are not
  logged (`lib/logger.ts` `errorSummary`). Decrypted credentials are only used in server
  modules (`server-only`) and never passed to Client Components.

## Webhook SSRF

Outgoing requests to user-controlled URLs (webhooks, CalDAV servers, ICS feeds) use `SafeFetch`:
DNS resolve then block private, loopback, link-local, CGNAT, multicast and metadata ranges
(IPv4 and IPv6, including IPv4-mapped IPv6), connect to the vetted IP, no redirects, 10 s
timeout, 5 MB response cap. Operators can explicitly allow private networks for LAN installs.
Details: [api-and-webhooks.md](./api-and-webhooks.md#ssrf-protection).

## Rate limiting and booking abuse

- Public endpoints limited per IP and per attendee email ([api-and-webhooks.md](./api-and-webhooks.md#rate-limiting)).
- Bot protection: honeypot field + minimum form fill time; optional Cloudflare Turnstile or
  hCaptcha (`CAPTCHA_PROVIDER`, keys) enabled per instance or per event type.
- Optional "require attendee email verification" (one-time code) for public event types.
- Slot holds limited to 1 active per session and expire in 10 minutes.
- Blocklist (M6): instance/team-level email and domain blocklist; blocked bookings silently
  succeed from the booker's view but are not created (prevents probing).
- Host notification throttling: a burst of bookings from one IP triggers review.

## Headers and CSP

Set in `proxy.ts` (Next 16's renamed middleware, Node.js runtime) and `next.config.ts` `headers()`:

- `Content-Security-Policy` with a per-request **nonce** (Next docs: nonces require dynamic
  rendering, `01-app/02-guides/content-security-policy.md`): `default-src 'self'; script-src 'self' 'nonce-...' 'strict-dynamic'; object-src 'none'; base-uri 'none'`.
- `frame-ancestors`:
  - dashboard, auth and settings routes: `'none'` (plus `X-Frame-Options: DENY`);
  - public booking pages (`/[username]`, `/[username]/[slug]`, `/booking/[uid]`) requested with
    `embed=1`: the instance-wide `EMBED_ALLOWED_ORIGINS` list (default `*`), and no
    `X-Frame-Options`; see [embeds](./embeds.md);
- `Strict-Transport-Security` (when `APP_URL` is https), `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, `Permissions-Policy` minimal, `poweredByHeader: false`.
- Cookies are `SameSite=Lax`; embeds never need the dashboard session, so third-party cookie
  blocking does not break booking.

## Privacy (GDPR)

- Data minimization: attendee name, email, answers, time zone; no tracking scripts by default.
- **Export**: user can download all their data as JSON (`gdpr.export` job) in M5.
- **Delete**: account deletion removes stored credentials (tokens are not revoked at the
  provider — revoke the app in your Google/Microsoft/Zoom account settings), schedules,
  event types, webhooks; bookings are cancelled with notification or anonymized where other
  hosts still need them. Attendees can request deletion via the host; admins have a
  "delete attendee data by email" tool (M6).
- Retention settings: auto-anonymize attendee data N months after the booking (default off).
- Self-hosting keeps data residency with the operator; no telemetry unless opted in.

## Dependency and code scanning

- CI: `npm audit --omit=dev --audit-level=high` (production dependencies), Dependabot for npm,
  GitHub Actions (pinned to commit SHAs) and the Docker base image.
- Container image: built for amd64, scanned with Trivy (HIGH/CRITICAL with a fix → fail) **before**
  anything is pushed, on `main` and on every release tag. The runtime image contains no package
  manager.
- Repository settings: GitHub CodeQL default setup, secret scanning with push protection and
  private vulnerability reporting are enabled on the public repository.
- Not in 1.0: Semgrep rules, OSV-Scanner and an SBOM attached to releases.
- License compliance for AGPL compatibility ([ADR-0001](../adr/0001-license-agplv3.md)); every
  page links to the source code (`SOURCE_URL`, AGPL §13).

## Security disclosure policy

[`SECURITY.md`](../../SECURITY.md) at the repository root is authoritative:

- Report privately via GitHub's "Report a vulnerability" (private vulnerability reporting);
  no public issues for vulnerabilities.
- Acknowledgement within 3 business days; fix or mitigation for high/critical within 30 days.
- Supported versions: the latest 1.x minor receives security fixes as patch releases.
- Coordinated disclosure with credit in the release notes.
