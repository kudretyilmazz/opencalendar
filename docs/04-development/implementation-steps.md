# Implementation Steps

The ordered, checkable task list we execute from. M0 and M1 are broken into PR-sized tasks; later milestones are listed as epics that get refined when their turn comes.

Last updated: 2026-09-28

Related: [Roadmap](../05-roadmap/roadmap.md) · [Requirements](../02-product/requirements.md) · [Conventions](./conventions.md) · [Testing](./testing.md)

## How to use this file

- Work top to bottom. Each `- [ ]` item is roughly one PR, and each PR follows TDD and the [definition of done](./conventions.md#definition-of-done).
- Tag PRs and commits with the requirement IDs in brackets.
- When a milestone starts, split its epics into tasks here first.

## Next.js 16 facts we rely on

Verified in `node_modules/next/dist/docs/`. Re-check before using any other framework API.

- `middleware.ts` is **deprecated** in favor of **`proxy.ts`**, which exports `proxy` and runs on the Node.js runtime only. It's used for auth redirects and CSP nonces.
- `serverRuntimeConfig` and `publicRuntimeConfig` are **removed**, and `NEXT_PUBLIC_*` values are frozen at build time. We read config only on the server via `lib/env.ts`, and call `connection()` where a page must not be prerendered with env values. See [ADR 0003](../adr/0003-self-host-first-single-app.md).
- Caching is opt-in through `cacheComponents` + `'use cache'`. It stays **off** in M0–M1 and gets revisited in M2 for public pages.
- Route Handlers are not cached by default.
- Server Actions check CSRF by comparing Origin and Host, but each action must still authenticate and authorize itself.
- `output: 'standalone'` requires copying `public/` and `.next/static` into the image. Multi-instance deployments need a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and a `deploymentId`.
- `next lint` is removed, so we use the ESLint CLI. `instrumentation.ts` `register()` runs once per server instance.

---

## M0 · Foundation

### 0.1 Tooling
- [x] Add `typecheck` script, strict `tsconfig`, ESLint + Prettier, EditorConfig, and a `.nvmrc` (Node 22) [NFR-017]
- [x] Vitest config (unit + integration projects), a Testcontainers helper, and Playwright config [ADM-003]
- [x] GitHub Actions: lint → typecheck → unit (UTC and America/New_York) → integration → build [ADM-003]
- [x] Add `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, and issue/PR templates

### 0.2 Config & database
- [x] `lib/env.ts`: Zod-validated runtime env that fails fast with readable errors [ADM-002]
- [x] `docker-compose.dev.yml` (postgres 16, mailpit) and `.env.example`
- [x] Drizzle setup with `db/schema/*`, the `drizzle.config.ts` file, migration scripts, and a custom migration enabling `btree_gist` [NFR-017]
- [x] `lib/crypto`: AES-256-GCM encrypt/decrypt with a key version prefix, plus unit tests [NFR-006]

### 0.3 Auth
- [x] Better Auth with the Drizzle adapter: email + password and email verification [AUTH-001]
- [x] Magic link plugin [AUTH-002]
- [x] Google and Microsoft OAuth, each enabled only when configured [AUTH-003]
- [x] Rate limiting (Postgres-backed buckets) on auth endpoints [AUTH-004]
- [x] Signup modes and the first-run admin [AUTH-005]
- [x] `proxy.ts`: redirect unauthenticated users from dashboard routes [NFR-007]

### 0.4 Jobs & email
- [x] pg-boss bootstrap and a worker entry (`worker` command, plus the `WORKER_MODE=inline` option via `instrumentation.ts`) [ADM-001]
- [x] Email service (Nodemailer + React Email), sent through a queue job with retries [NTF-001]

### 0.5 Shell & ops
- [x] Dashboard layout, navigation, and settings pages (profile, timezone, locale, week start, time format, theme) [ADM-005]. Note: small hand-written primitives in `components/ui/primitives.tsx` instead of the shadcn/ui CLI; adopt shadcn when M1 needs richer components (date picker, dialogs).
- [x] `/api/health/live` and `/api/health/ready` [ADM-004]
- [x] Production Dockerfile (standalone), `docker-compose.yml` (app, worker, postgres), and migrations on start [ADM-001, NFR-013]

**M0 exit check:** fresh clone → `docker compose up` → sign up → verification email appears in Mailpit → sign in → settings save.

**Status (2026-09-28): done.** Verified by:
- 123 Vitest tests (unit + integration on real PostgreSQL 16 via Testcontainers); coverage 97% lines / 93% branches for non-UI code.
- 5 Playwright flows (sign-up → verify → settings → sign-out → sign-in with safe `next`, magic link, password reset, CSP/redirects, health), with a guard that fails on any browser console error. Run green against `next dev`, the standalone production server, and the Docker Compose stack (web + separate worker + Postgres + Mailpit).
- Concurrency tests: one admin when first sign-ups race; lockout holds under a parallel burst of 25 wrong passwords.
- Not verified locally: the GitHub Actions workflow itself and the multi-arch GHCR publish (they run on the first push).
- Code review follow-ups applied: sealed (encrypted) email job payloads, race-free first admin, atomic lockout, trusted-proxy IP resolution, disabled-account session block, maintenance pruning job, PII-safe error logging, safe `next` redirects.


---

## M1 · Core scheduling

### 1.1 Availability engine (pure, TDD first)
- [x] `lib/availability/intervals.ts`: normalize, union, intersect, subtract, with property-based tests [AVL-003]
- [x] Expand weekly rules to UTC ranges in the schedule timezone, including DST [AVL-004]
- [x] Apply date overrides [AVL-002]
- [x] Busy from bookings with buffers; min notice; horizon (rolling, business days, fixed) [EVT-003, EVT-004, EVT-005]
- [x] Slot generation (interval, duration fit, alignment, multiple durations) [EVT-002, EVT-006]
- [x] Reason codes for every excluded candidate [AVL-005]
- [x] Performance benchmark test (30 days, 500 busy intervals) [NFR-001 prep]

### 1.2 Schedules
- [x] Schema: `schedule`, `schedule_rule`, `date_override` [AVL-001, AVL-002]
- [x] Server actions + UI: weekly editor, timezone picker, overrides calendar, default schedule [AVL-001, AVL-002]

### 1.3 Event types
- [x] Schema: `event_type`, `event_type_duration_option` [EVT-001, EVT-002]
- [x] CRUD actions with ownership checks and authZ tests; list, reorder, duplicate [EVT-001]
- [x] Editor UI: basics, durations, buffers, notice, horizon, interval, location [EVT-001…007]

### 1.4 Public booking
- [x] Slots service that loads data and calls the engine, plus a slots route handler for the client picker [AVL-003]
- [x] Profile page `/{username}` [BKG-001]
- [x] Booking page: month calendar, slot list, tz detection/picker, 12/24h [BKG-002, BKG-003, I18N-001]
- [x] Slot hold via `slot_reservation` [BKG-006]
- [x] Booking form + `createBooking`: transaction, advisory lock, exclusion constraint, idempotency; concurrency tests [BKG-004, BKG-005, NFR-004]
- [x] Confirmation page with ICS download and add-to-calendar links [BKG-007]

### 1.5 Notifications
- [x] ICS builder (`METHOD:REQUEST/CANCEL`, stable UID, SEQUENCE) [NTF-002, NTF-003]
- [x] Confirmation emails to booker and host [NTF-002]

### 1.6 Manage bookings
- [x] Tokenized manage links with ≥128-bit tokens [BKG-011]
- [x] Cancel via link, with a reason [BKG-008, NTF-003]
- [x] Reschedule via link: slots exclude the original booking, and the original gets status `RESCHEDULED` and is linked to the new one [BKG-009, NTF-003]
- [x] Host dashboard with Upcoming / Unconfirmed / Past / Cancelled tabs and host-side cancel [BKG-010]

### 1.7 Hardening
- [x] Account deletion [ADM-006]
- [x] Accessibility pass: keyboard slot picker and axe checks in E2E [NFR-008]
- [x] Backup/restore docs and script check [NFR-014]
- [x] E2E flows 1–4 and 8 [testing](./testing.md#critical-e2e-flows)

**M1 exit check:** a stranger can book you through your link. You and they both get correct emails and ICS, and cancel and reschedule work end to end.

**Status (2026-09-29): done.** Verified by:
- 241 Vitest tests (unit + integration on PostgreSQL 16). Engine: property-based interval laws and NFR-005 invariants, 14 time zones incl. half-hour/45-minute offsets and Lord Howe's 30-minute DST, the doc's test matrix, a 30-day/500-booking performance check. Integration: 50 parallel bookings for one slot → exactly one (NFR-004), a direct overlapping write rejected by the exclusion constraint, reschedule/cancel/token rules, holds, owner scoping, account deletion.
- 12 Playwright flows, green twice in a row against `next dev` and once against the Docker Compose stack: host setup → public profile → booking → emails with `text/calendar; method=REQUEST` → dashboard; booker in New York/Tokyo sees converted times and 12h/24h; reschedule (same ICS UID, SEQUENCE 1) and cancel (`method=CANCEL`) through the emailed link; forged token can't act; host "request reschedule"; date override removes a day; account deletion. axe-core: zero serious/critical violations on the profile, booking and dashboard pages. Any browser console error fails a test.
- Backup/restore drill with `pg_dump -Fc` / `pg_restore --clean` on the Compose stack (NFR-014).
- Code review follow-ups applied: holds validated by the engine and capped per host; per-IP/per-email rate limits on all public booking endpoints; manage token moved from URL query to POST body for slot lookups and `no-referrer` on token pages; tokenless pages/ICS no longer reveal attendee names or the host email; booker notes not relayed to guests; invalid locales canonicalized; per-recipient email isolation; guests kept on reschedule; event types with upcoming bookings can't be deleted; account deletion disables first and tolerates races; stale slot responses ignored; expired holds pruned.
- Deviations: the single M1 location lives on `event_type` (moves to `event_type_location` in M2); holds are M1 (were M3); buffers are part of the exclusion-constraint range (see data-model); `next-themes` replaced by a small provider + `next/script` because of a React 19 client-script warning.


---

## M2 · Calendars & video
- [x] Adapter framework, registry, credential storage and health [INT-001, INT-012, INT-013]
- [x] Google Calendar + Meet [INT-002, INT-008]
- [x] Microsoft Graph + Teams [INT-003, INT-008]
- [x] CalDAV (tsdav) with iCloud/Fastmail/Nextcloud presets; ICS feeds [INT-004, INT-005]
- [x] Conflict and destination calendar selection; busy merge + cache [INT-006, INT-007, AVL-006, AVL-007]
- [x] Typed multi-locations; Zoom; Jitsi/custom link; in-person/phone [EVT-008, INT-009…011]
- [x] Booking side effects via jobs (create, update, delete external events) with `booking_reference`
- [x] Observability (structured logs, `/api/metrics`, job retries) and graceful provider failure [NFR-010, NFR-016]

**M2 exit check:** connected calendars block slots and receive events with meeting links; reschedule and cancel update or delete them.

**Status (2026-09-29): done, with the limits below.** Verified by:
- 351 Vitest tests, line coverage ≈ 87%. Integration on PostgreSQL 16: connect/reconnect (verified before anything is written, one credential per account), busy cache TTL, stale data and fail-closed, per-event-type calendars, Meet link sync, reschedule updates in place (also across a chain of reschedules and after an earlier failed create), cancel deletes, Zoom, one token refresh under concurrency, revoked credential notified once, `booking.process` retries without duplicates, skips/undoes work for bookings cancelled before or during the sync, emails once. CalDAV against a real Radicale server (Testcontainers): discovery, recurring busy times, create/update/delete, wrong password, SSRF block.
- 17 Playwright flows green on `next dev` and on the Docker Compose stack (app in a container reaching Radicale and a local ICS feed): CalDAV busy/write/delete, ICS feed, phone/Jitsi locations with emails, OAuth buttons hidden when unconfigured, metrics auth, plus all M0/M1 flows.
- NFR-001 load test (`scripts/loadtest.ts`, 1 host, 30-day window, 60 bookings, 400 cached calendar events, 100 connections, app limited to 1 CPU / 1 GB): 483–526 rps, p97.5 296–298 ms, p99 367–444 ms, no errors, ~175 MB RSS. It passes, but with little headroom on one CPU.
- Security review follow-ups: SSRF guard re-checks addresses at socket connect (DNS rebinding), blocks NAT64/6to4/documentation ranges, and drops credentials on cross-origin redirects; ICS feed URLs are never stored in clear (opaque calendar id); CalDAV requires https unless `ALLOW_PRIVATE_NETWORK_INTEGRATIONS`; cancellation jobs are queued in the cancelling transaction; bookings are refused once an account deletion has started; recurrence expansion has a per-feed budget and fails closed; GitHub Actions pinned to commit SHAs with Dependabot.
- **Not verified end to end:** Google, Microsoft 365 and Zoom with real accounts (needs registered OAuth apps). They are covered by contract tests against recorded API shapes and in-memory fakes only. Zero-downtime deploys with two replicas are not verified (single replica restarts to ready in ~1 s).
- Deviations: busy fetch uses `events.list`/`calendarView` instead of free/busy endpoints (so our own events can be ignored); calendars whose credential was revoked are skipped (fail open) and the host is warned by email and banner, while transient failures fail closed; public slot context is cached 10 s per process (invalidated on the host's own saves).

---

## M3 · Booking power features
- [x] Booking questions builder + answers storage + URL prefill (+ UTM) [EVT-009, BKG-014]
- [x] Limits (frequency and duration) in the engine, `limit_reached` [EVT-010]
- [x] Requires confirmation (+ "only within N hours") + accept/reject (dashboard and signed email links) + emails [EVT-011, BKG-012, NTF-004]
- [x] Seats, recurring series [EVT-012, EVT-013]
- [x] Hidden event types, single-use links (+ "link only"), redirect, policies [EVT-014…017]
- [x] No-show marking [BKG-013]
- [x] Explainability view: `/availability/troubleshoot` [AVL-008]
- [x] Email workflows + default 24 h reminder [NTF-005, NTF-006]
- [x] Embed script (inline, popup, floating), postMessage protocol v1, auto-resize, `frame-ancestors` [EMB-001…005], 3.8 KB gzipped [NFR-003]
- [x] Webhooks: subscriptions, HMAC, delivery via jobs, SSRF guard, versioned payloads, delivery log + manual retry [API-001…005]
- [x] Anti-abuse on public endpoints: per-IP/per-email rate limits + optional self-hosted ALTCHA proof-of-work (`CAPTCHA=altcha`) [ADM-007]

**M3 exit check:** questions/prefill, confirmation, seats and the troubleshooter pass E2E; a webhook receiver verifies the signature and retries; the embed works on a third-party test page.

**Status (2026-09-29): done, with the notes below.** Verified by:
- 452 Vitest tests (53 files), line coverage ≈ 83%. New: engine limits (local periods, ISO weeks, DST zones) and seats; answer validation and URL prefill; recurrence (DST, month-end clamping); redirect builder; signed links; ALTCHA (replay by re-encoding, DB-backed); email/ICS privacy for seats and guests; workflow dispatch. Integration on PostgreSQL 16 (`booking-power.int.test.ts`, `webhooks.int.test.ts`, `captcha.int.test.ts`, `jobs.int.test.ts`): pending → accept/reject (token carried to the acceptance email, past requests refused), threshold, seats fill/leave/last-seat, series booked atomically and cancelled, limits, single-use links (used/expired), cancel cutoff, no-show, troubleshooter reasons, `booking.process` for requested/accepted (decision links, reminders, end-of-meeting job), stale reminder dropped, per-seat reminder privacy, webhook scope/signature/retries/SSRF, a 20-email burst delivered in < 8 s.
- 21 Playwright flows green on `next dev` and on the Docker Compose stack: all M0–M2 flows plus questions + prefill + request + signed email link acceptance, seats (“2 seats left” → “1 seat left”), troubleshooter, and the embed on a third-party origin (inline, popup, floating, events, auto-resize).
- Code review (subagent) of M3: no CRITICAL; the HIGH (ALTCHA replay through re-encoded payloads) and all MEDIUM findings were fixed and covered by tests — seat notes/answers kept per seat, first-seat emails scoped to that seat, per-recipient reminders, holds no longer hide seated slots, seat-leave CANCEL only to the seat (SEQUENCE bumped), manage link in acceptance emails, recurring default = 1, UTM capped; LOW: empty required numbers, past acceptance, email job ids, series lock order.
- Found by the new tests and fixed: seat counts were always 0 (unqualified column in a subquery); request emails failed to enqueue (job template enum out of date, now derived); emails were processed one per ~2 s (now LISTEN/NOTIFY + concurrent consumers, 2 s backstop poll for retries/delayed jobs).
- NFR-001 re-check: 796 rps, p97.5 236 ms, p99 359 ms (PASS) on the production build running natively; 1.4 ms CPU per slot request (≈ 700 rps per core). On the 1-CPU Docker stack the run failed (343–402 rps, p97.5 530–556 ms) while the shared test machine had a load average of 10–15 from unrelated processes; the same setup passed at 483–526 rps earlier the same day. The slot hot path barely changed in M3, so this needs a re-run on a quiet/dedicated machine rather than code changes.
- NFR-003: embed script 3.8 KB gzipped (test-enforced budget 15 KB).
- Deviations: seated bookings can't be rescheduled (cancel the seat and book again); recurring series can't be rescheduled as a whole (cancel one or all occurrences); workflows are one email step per event type (no SMS, no team scope); editing a workflow does not move already-scheduled reminders (they re-check the booking but keep their original time); ALTCHA is the only CAPTCHA option (Turnstile not implemented).

---

## M4 · Teams
- [x] Teams, invitations, roles + a team authZ test suite [TEAM-001…003]
- [x] Hosts model; collective; round robin with weights and priority; fixed + RR [TEAM-004…007]
- [x] Managed event types (template, assignment, locked fields, propagation) [TEAM-008]
- [x] Dynamic group links `/{a}+{b}` (shared team + per-user opt-in) [TEAM-009]
- [x] Team availability view (day/week, viewer's zone, busy blocks only) [TEAM-010]
- [x] Routing forms: builder, rules, fallback, prefill, trace + CSV, embed/headless [RTE-001…006]
- [x] Team workflows (incl. a default team reminder) [NTF-007]
- [ ] v1.0 release checklist in the [roadmap](../05-roadmap/roadmap.md#v10-release-criteria) — see the status there

**M4 exit check:** E2E flow 7 (round robin → correct host) passes; a weighted round-robin
distribution stays within tolerance over 1,000 simulated bookings; the authorization tests cover
every team resource.

**Status (2026-09-29): done, with the notes below.** Verified by:
- 558 Vitest tests (61 files), line coverage ≈ 85% (`lib/availability` 100% lines). New pure
  engine parts: `lib/availability/team.ts` (collective = every fixed host free, round robin =
  union of the pool with the free hosts per slot, fixed + pool) and
  `lib/availability/round-robin.ts` (weighted load → priority → fewer bookings → fixed order, with
  a stored reason). The distribution test books 1,000 times with weights 1:2:3:4 (exact
  proportions) and with ~30 % random unavailability (within 3 percentage points of the weights).
- Integration on PostgreSQL 16 (`teams.int.test.ts`, `teams-admin.int.test.ts`,
  `routing-forms.int.test.ts`): the role matrix on every team service (outsider → NOT_FOUND,
  member → FORBIDDEN, admin vs owner rules, last owner), invitations (verified matching email,
  expiry, decline, sender's current role caps the grant), round robin (priority tie-break, busy
  host skipped, reason stored), fixed + pool, collective (all hosts blocked, co-host sees and
  cancels), dynamic groups (shared team + opt-in), managed types (copies, locked-field push,
  member edits ignored for locked fields, unassign, slug clash rolls back), member removal
  (reassign to a free pool host incl. at a daily limit, pending requests change hands quietly,
  collective co-host leaves, cancel option, a removed host can't be booked by a stale page), team
  workflows, account deletion handing team resources over, team deletion keeping members' copies,
  availability view without meeting details.
- 23 Playwright flows green on `next dev` and on the Docker Compose stack (production image,
  1 CPU / 1 GB): all earlier flows plus **flow 7** (team → invitation accepted by email → round
  robin with priority → first booking to the priority host, second to the other one; public team
  page, availability view, axe) and routing forms (builder → rule to a prefilled booking page →
  booking linked to the response, fallback message, headless redirect, responses + CSV). The
  routing-form E2E found a real accessibility issue (non-focusable scrolling `<pre>`), fixed.
- NFR-002 (`scripts/loadtest-team.ts`, 10 hosts in 5 zones, 20 bookings and 200 cached calendar
  events each, 30-day window, 20 concurrent connections): **PASS** — native production build:
  round robin p97.5 327 ms, collective 253 ms; Docker 1 CPU: round robin p97.5 687 ms,
  collective 404 ms (round robin has little headroom on one CPU).
- NFR-001 re-check: native 956 rps, p97.5 145 ms (PASS, no regression from the target
  resolver). Docker 1 CPU still FAIL (420 rps, p97.5 449 ms) with the shared machine at load
  average 7–10 — still open, needs a quiet/dedicated machine (see M3).
- Reviews (code + security subagents): no CRITICAL. Fixed: account deletion/removal would have
  cascaded away team event types (with everyone's bookings), team workflows and forms created by
  the leaver → hand-over; team deletion would have cascaded members' managed copies → detached
  and kept; a demoted/removed creator could still attach workflows to team event types →
  refused; duplicating a managed copy kept the template link; managed saves not atomic; lock
  order between removal and reschedule (deadlock) and hosts re-checked under the locks;
  reassignment ignored its own booking against limits; pending bookings got confirmation emails
  on reassignment; reassignment email ids without sequence; rebook links for team bookings;
  co-host own-event detection; invitation abuse (verified email, rate limit, pending cap);
  invitation grants capped by the sender's current role; dynamic groups need opt-in (no
  membership oracle, no booking without consent); routing forms per-form rate limit, no storage
  on prefetch, one booking per response; malformed URL escapes → 404; duplicate team + copy
  reminders. Checked and already safe: account pre-hijack via magic link/OAuth (Better Auth
  revokes unproven credentials; regression test added).
- Deviations:
  - Team event types have no per-type schedule (each host's own schedule, or the host row's),
    and no seats, recurring series or single-use links (personal-only).
  - Calendar sync writes the event to the **organizer's** destination calendar only; collective
    co-hosts are attendees of that event and get the ICS by email (no per-host calendar writes).
  - Slot holds (BKG-006) are not taken for team slots (the host is only known at booking time).
  - Team availability view shows each member's default schedule and busy blocks (bookings and
    connected calendars), not per-event-type schedules.
  - When a collective co-host leaves, the meeting continues without them and nobody is emailed;
    reassigned round-robin meetings email attendees and hosts ("now with …") and move the
    calendar event.
  - Routing rules and fields are stored as validated JSON (see data model); a routing form's
    external URL targets are https-only but not allow-listed; routing forms have no CAPTCHA.
  - Managed copies are created without an acceptance step; when a copy leaves its template with
    upcoming bookings it stays as a switched-off personal event type without the redirect.
  - A deleted co-host's `booking_host` row cascades without notifying the other participants.
  - In `next dev` the account-deletion flow once logged a React "script tag" console warning on
    the first compile of `/?deleted=1`; not reproducible on re-runs or on the production build.

## v1.0 release pass (2026-09-29)

The requirement matrix ([traceability](../05-roadmap/traceability.md)) and a whole-app security
review found gaps that were closed before tagging 1.0:

- **Closed Must gaps:** invite-only sign-up admits addresses with a pending team invitation
  (AUTH-005); calendar polling interval configurable with `CALENDAR_POLL_SECONDS` (AVL-007);
  the troubleshooter covers team admins and their teams' hosts, without the host's meeting
  titles, and names the schedule behind working-hours reasons (AVL-008); event-type
  descriptions render a safe Markdown subset (EVT-001); workflow emails have working
  `{cancel_url}`/`{reschedule_url}` links for the booker (NTF-005); a typed `PaymentAdapter` in
  the adapter framework (INT-001); team-scoped webhooks and the `FORM_SUBMITTED` trigger
  (API-001); the embed script accepts team, group and routing-form links, and embedded routing
  forms auto-resize (EMB-001, RTE-006).
- **Security review fixes:** `node cli.js rotate-keys` and `create-admin` (documented but
  missing); compose publishes the app on 127.0.0.1 only and needs `POSTGRES_PASSWORD`; guests
  count against the per-recipient booking email limit; sign-in OAuth tokens encrypted; a CSRF
  backstop in `proxy.ts`; the image is scanned before it is pushed and contains no npm; AES-GCM
  tag length pinned; extra SSRF prefixes; HSTS only for https deployments; non-random keys
  refused in production; 7-day sessions set explicitly; docs corrected where they promised more
  than the code does.
- **Release engineering:** version 1.0.0, `CHANGELOG.md`, a tag-driven release workflow (full CI
  → Trivy → multi-arch GHCR image with semver tags → GitHub Release), an upgrade test from the
  previous pre-release's schema with data (NFR-013), AGPL source link in every page footer
  (`SOURCE_URL`), version on `/api/health/live`, user guide (`docs/06-user-guide`).
- **Performance fix:** the public slot endpoint shares each host's bookings/holds for one second
  (own hold still excluded per request; booking and holding always re-read): NFR-001 on the
  1 CPU / 1 GB container went from 465 req/s, p97.5 355 ms (fail) to 877–1001 req/s, p97.5
  206–248 ms, p99 ≤ 392 ms (pass). The booking page now server-renders the event details
  (title, host, duration, description) before hydration: Lighthouse mobile LCP 3.2 s → 1.8–2.5 s
  (median 1.9 s), TBT 10 ms, CLS 0.009, accessibility 100 (NFR-003).
- **Cross-browser fixes (NFR-018):** the event type form's time-zone list broke hydration in
  Firefox (each engine lists slightly different zones) — now filled after hydration; the theme
  script is a plain inline script in the root layout; Zod's eval probe is off in the browser
  (the CSP forbids eval, Firefox logged it).
- **Verification:** 590+ Vitest tests (unit + integration on PostgreSQL 16, incl. key rotation,
  the upgrade path from the M3 schema, worker-crash durability); lint, typecheck and actionlint
  clean; `npm audit --omit=dev` 0 vulnerabilities; Trivy HIGH/CRITICAL clean on the image. A
  fresh stack made from `.env.example` and `docker-compose.yml` (app limited to 1 CPU / 1 GB)
  came up in 12 s; the full E2E suite passed on it in Chromium, Firefox and WebKit (49 runs);
  the first account became the admin, `create-admin` worked, idle memory: app 123 MiB, worker
  69 MiB, Postgres 54 MiB; `docker compose restart app` → ready in 1.2 s. NFR-002 passed on the
  same stack.
- **Deviations recorded here (kept for 1.0):**
  - AVL-007: no push notifications from Google/Microsoft; they are polled at most every 2 min.
  - TEAM-006: priority has five levels (lowest … highest) rather than three.
  - TEAM-010: the availability view's week starts on Monday regardless of the viewer's setting.
  - API-004: private webhook targets are allowed instance-wide by `WEBHOOK_ALLOW_PRIVATE`, not
    per user in the app.
  - INT-001: payment is an interface only; the Stripe adapter is M5.
  - ADM-006: account deletion deletes stored provider tokens but doesn't revoke them at the
    provider.
  - Session list / "sign out everywhere" and a password-change screen are not in 1.0 (password
    reset works and revokes all sessions).
  - NFR-010: every request gets an `X-Request-Id` (kept from the reverse proxy when valid) and job
    logs carry the job id, but application log lines don't include the request id yet, and
    there is no OpenTelemetry exporter (Prometheus metrics at `/api/metrics` only).
  - NFR-016: zero-downtime rolling restarts with two replicas were not exercised (no load
    balancer in the test setup); single-replica restart time is measured in the self-host check.
  - NFR-018: automated E2E runs in Chromium, Firefox and WebKit; importing the generated ICS
    files into Google, Outlook, Apple Calendar and Thunderbird was not checked by hand.

## M5 / M6
Break these down when M4 is closing. See the [roadmap](../05-roadmap/roadmap.md#m5--platform).
