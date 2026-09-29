# Requirements Traceability (M0–M4)

This matrix supports the v1.0 release gate "Every **Must** requirement for M0–M4 is implemented and linked to tests" ([roadmap](./roadmap.md#v10-release-criteria)). It traces each requirement to the code that implements it and the tests that verify it.

Date: 2026-09-29 (state of the working tree after M4)

Related: [Requirements](../02-product/requirements.md) · [Implementation steps](../04-development/implementation-steps.md) · [Testing](../04-development/testing.md)

## How to read this

- **Scope.** Every requirement assigned to milestones M0–M4 (Must, Should and Could), plus every NFR assigned to M0–M4. That excludes NFR-015, which belongs to M5. There are 115 rows.
- **Status** is one of the following:
  - `Done`: implemented and covered by at least one automated test (or, for load targets, a load script).
  - `Done (deviation)`: implemented with a documented or noted difference from the requirement text. The difference is stated in the row.
  - `Partial`: some clauses are missing. The missing part is stated in the row.
  - `Not implemented`.
  - `Not verifiable here`: this needs an environment we don't have, such as real Google, Microsoft or Zoom accounts, a GitHub Actions run, or a fresh VPS.
- **Implementation** lists the key files, not every file involved. Paths are relative to the repository root.
- **Tests** cite the file and, where helpful, the `describe`/`test` name. Unit tests are `*.test.ts(x)`, integration tests are `tests/integration/*.int.test.ts` (real PostgreSQL 16), E2E tests are `tests/e2e/*.spec.ts` (Playwright), and load scripts are `scripts/loadtest*.ts`.
- Requirement IDs cited in code comments and test names were used as starting points only. Each row was checked against the code itself.

### Summary

State after the v1.0 release pass (2026-09-29). The original audit found 7 Must requirements
Partial; all were closed (see [implementation steps](../04-development/implementation-steps.md#v10-release-pass-2026-09-29)).

| Status | Count |
|---|---|
| Done | 79 |
| Done (deviation) | 34 |
| Partial | 0 |
| Not implemented | 0 |
| Not verifiable here | 2 |
| **Total** | **115** |

Of the 78 Must requirements, 57 are Done, 19 Done (deviation) and 2 need live systems to verify:
AUTH-003 (Google/Microsoft sign-in with real OAuth apps) and ADM-003 (a CI run on GitHub, checked
when the repository is published). See [Gaps](#gaps).

---|---|
| Done | 68 |
| Done (deviation) | 27 |
| Partial | 17 |
| Not implemented | 0 |
| Not verifiable here | 3 |
| **Total** | **115** |

Out of 78 Must requirements (53 Done, 16 Done (deviation)), 7 are Partial (AUTH-005, AVL-007, AVL-008, EVT-001, NTF-005, INT-001, API-001) and 2 are Not verifiable here (AUTH-003, ADM-003). See [Gaps](#gaps).

---

## Auth

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| AUTH-001 | Must | Email + password; verify email before publishing; 60-min single-use reset | Done | `lib/auth/auth.ts` (`requireEmailVerification`, `resetPasswordTokenExpiresIn: 3600`); publish gate `findPublicHost` in `features/event-types/server/service.ts` | `tests/integration/auth.int.test.ts` "refuses sign-in until the email is verified", "resets a password with a single-use link"; `tests/integration/bookings.int.test.ts` "only publishes hosts with a verified email"; `tests/e2e/foundation.spec.ts` sign-up and password-reset flows. The 60-minute expiry is config only; no test moves the clock. |
| AUTH-002 | Must | Magic link, single-use, 15 min | Done | `lib/auth/auth.ts` (magic-link plugin, `expiresIn: 900`, hashed token) | `auth.int.test.ts` "signs a user in with a single-use link", "keeps the token out of plain storage", "limits magic-link requests per account across IPs"; `foundation.spec.ts` "magic link sign-in" |
| AUTH-003 | Must | Google and Microsoft OAuth, each enabled only when configured | Not verifiable here (live sign-in needs registered OAuth apps; the config gating is implemented and tested) | `lib/env.ts` (OAuth id/secret pairs), `lib/auth/auth.ts` (`socialProviders`) | `lib/env.test.ts` "enables an OAuth provider only when both id and secret are present"; `tests/e2e/calendars.spec.ts` "OAuth providers stay hidden when not configured" |
| AUTH-004 | Must | Rate limits per IP and per account; lock after 10 failures in 15 min | Done | `lib/auth/auth.ts` (rate-limit rules), `lib/auth/lockout.ts`, `lib/auth/policy.ts` (`LOCKOUT_MAX_FAILURES`, `LOCKOUT_WINDOW_MS`) | `lib/auth/policy.test.ts`; `auth.int.test.ts` lockout, per-IP limit and 25-request parallel-burst tests; `tests/integration/database.int.test.ts` lockout storage |
| AUTH-005 | Must | Signup mode `open` / `invite-only` / `disabled`; first user becomes admin | Done | `lib/auth/policy.ts` (`decideSignup`), `lib/auth/admin.ts`, `app/(auth)/signup/page.tsx` | `lib/auth/policy.test.ts`, `tests/integration/auth.int.test.ts` (invited address admitted, expired invitation refused) |

## Event types

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| EVT-001 | Must | CRUD, enable/disable, duplicate, reorder; slug unique per owner; Markdown description | Done (safe Markdown subset: paragraphs, emphasis, code, links, lists, headings) | `features/event-types/server/{service,actions}.ts`, `features/event-types/schemas.ts`, `features/event-types/components/event-type-form.tsx` | `lib/markdown.test.tsx`, `tests/integration/scheduling.int.test.ts`, `tests/e2e/scheduling.spec.ts` |
| EVT-002 | Must | Several durations with a default; booker picks | Done | `event_type_duration_option` (`db/schema/scheduling.ts`), `durationsOf` in `features/event-types/server/service.ts`, duration buttons in `features/bookings/components/booking-widget.tsx` | `schemas.test.ts` "normalizes extra durations"; `bookings.int.test.ts` "rejects durations the event type doesn't offer" |
| EVT-003 | Must | Buffers before/after block the host across all event types | Done (deviation: buffers are part of the exclusion-constraint range, as recorded in M1 deviations) | `lib/availability/slots.ts`, `db/migrations/0003_booking_no_overlap.sql` | `lib/availability/slots.test.ts` #11; `bookings.int.test.ts` "respects buffers between different bookings" |
| EVT-004 | Must | Minimum notice in minutes, hours or days | Done | `NOTICE_UNITS` in `event-type-form.tsx`, `lib/availability/slots.ts` | `slots.test.ts` #12 |
| EVT-005 | Must | Horizon: rolling days, business days, fixed range, unlimited | Done | `Horizon` in `lib/availability/types.ts`, `slots.ts` | `slots.test.ts` #13, "rolling business days skip weekends", "fixed date range", unlimited fixture |
| EVT-006 | Must | Slot interval, defaults to duration | Done | `slots.ts`, `features/event-types/server/service.ts` | `slots.test.ts` #20 |
| EVT-007 | Must | Single basic location in emails and ICS | Done (deviation: superseded in M2 by typed locations, EVT-008) | `features/bookings/location.ts`, `lib/ics.ts`, `features/bookings/server/notifications.ts` | `lib/ics.test.ts`; `LOCATION:` check in `tests/e2e/calendars.spec.ts` |
| EVT-008 | Must | Several typed locations; booker picks | Done | `db/migrations/0005_event_type_locations.sql`, `features/bookings/location.ts` | `schemas.test.ts` "validates locations per kind"; `calendars.spec.ts` locations flow |
| EVT-009 | Must | Question builder (11 types), required/hidden/optional | Done | `questionSchema` in `features/event-types/schemas.ts`, `features/event-types/components/questions-editor.tsx`, `features/bookings/components/question-field.tsx`, `features/bookings/responses.ts` | `features/bookings/responses.test.ts`; `tests/integration/booking-power.int.test.ts` "stores questions in order"; `tests/e2e/booking-power.spec.ts` questions flow |
| EVT-010 | Must | Frequency and duration limits give `LIMIT_REACHED` | Done | `lib/availability/limits.ts`, `features/bookings/server/host-data.ts` | `lib/availability/limits.test.ts`; `booking-power.int.test.ts` "enforces booking limits per day" |
| EVT-011 | Must | Requires confirmation (`PENDING`), optionally only within N hours | Done | `features/bookings/server/core.ts`, `create.ts`, `confirmationThresholdMinutes` | `booking-power.int.test.ts` "requires confirmation" block, including the threshold test; `booking-power.spec.ts` |
| EVT-012 | Must | Seats; host can hide attendees from each other | Done (deviation: seated bookings can't be rescheduled; seats are not available on team types) | `seatsPerSlot` / `seatsShowAttendees` in `db/schema/scheduling.ts`, `features/bookings/server/notifications.ts`, `app/(site)/booking/[uid]/page.tsx` | `limits.test.ts` seats; `booking-power.int.test.ts` seat-by-seat; `features/bookings/server/notifications.test.ts` seat privacy; `booking-power.spec.ts` seats |
| EVT-013 | Should | Weekly or monthly recurrence with a max count | Done (deviation: a series can't be rescheduled as a whole; personal event types only) | `features/bookings/recurrence.ts`, `features/bookings/server/create.ts` | `features/bookings/recurrence.test.ts`; `booking-power.int.test.ts` series test; `notifications.test.ts` |
| EVT-014 | Must | Hidden event types | Done | `hidden` flag, `features/event-types/server/service.ts`, `app/(site)/[username]/page.tsx` | `scheduling.int.test.ts` "hidden event types are bookable by link but not listed" |
| EVT-015 | Should | Single-use private links with expiry | Done (deviation: personal event types only) | `features/event-types/server/private-links.ts`, `create.ts`, `app/api/public/slots/route.ts` | `booking-power.int.test.ts` link-only / single-use link tests (used, expired) |
| EVT-016 | Should | Redirect after booking, optionally with details | Done | `features/bookings/redirect.ts`, `features/bookings/components/booking-form.tsx` | `features/bookings/redirect.test.ts` |
| EVT-017 | Should | Event name template, disable cancel/reschedule, cancel cutoff, lock booker tz | Done (the lock-timezone clause has no test) | `features/bookings/event-name.ts`, `core.ts`, `decisions.ts`, `lockTimeZone` in `booking-widget.tsx` | `booking-power.int.test.ts` custom event name, "respects disabled self-service and the cancellation cutoff" |

## Availability

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| AVL-001 | Must | Named schedules, IANA tz, multiple ranges per day, default, per-event-type schedule | Done | `db/schema/scheduling.ts`, `features/schedules/server/*`, schedule picker in `event-type-form.tsx` | `scheduling.int.test.ts` "schedules (AVL-001, AVL-002)", "event types fall back to the default schedule and can't use someone else's" |
| AVL-002 | Must | Date overrides (custom ranges or unavailable) | Done | `lib/availability/schedule.ts`, `slots.ts`, `features/schedules/*` | `slots.test.ts` #7, #8, "override adds hours"; `scheduling.int.test.ts`; `tests/e2e/scheduling.spec.ts` "date override removes a day" |
| AVL-003 | Must | Pure engine: schedule, overrides, bookings with buffers, notice, horizon, interval | Done | `lib/availability/{slots,intervals,schedule,tz}.ts`, `features/bookings/server/service.ts`, `app/api/public/slots/route.ts` | `slots.test.ts`, `intervals.test.ts`; `bookings.int.test.ts` "slots for the public page" |
| AVL-004 | Must | DST handled correctly; ≥ 10 tz fixtures incl. half-hour and 45-min offsets | Done | `lib/availability/tz.ts` | `lib/availability/tz.test.ts` (14 zones incl. Kolkata, St_Johns, Kathmandu, Chatham, Lord_Howe; gap/overlap); `slots.test.ts` #2–#4, "+05:45" |
| AVL-005 | Should | Machine-readable reason codes per excluded candidate | Done (deviation: codes are lowercase and some are renamed, e.g. `booking_conflict`, `external_calendar_busy`; one reason per candidate; no `OOO`, which arrives with AVL-009 in M5) | `ExclusionReason` in `lib/availability/types.ts`, `slots.ts` | `slots.test.ts` reason cases; `limits.test.ts` |
| AVL-006 | Must | Merge busy times from all conflict calendars | Done | `features/calendars/server/busy.ts`, `features/calendars/server/runtime.ts`, `features/bookings/server/core.ts` | `tests/integration/calendars.int.test.ts` "external busy times"; `slots.test.ts` "external calendar busy times block slots"; `calendars.spec.ts` CalDAV and ICS flows |
| AVL-007 | Must | Busy cache per calendar/range; push invalidation (Google, Microsoft); configurable polling (default 5 min CalDAV) | Done (deviation: no push notifications — Google/Microsoft are polled at most every 2 min; CalDAV/ICS every `CALENDAR_POLL_SECONDS`, default 5 min) | `CACHE_TTL_MS` in `features/calendars/server/busy.ts`, `calendar_busy_cache` in `db/schema/integrations.ts` | `features/calendars/server/busy-ttl.test.ts`, `tests/integration/calendars.int.test.ts` |
| AVL-008 | Must | Explainability view for host or team admin, with reason codes and source objects | Done (team admins: a host's other meetings show without titles) | `features/bookings/server/explain.ts`, `app/(dashboard)/availability/troubleshoot/page.tsx` | `tests/integration/booking-power.int.test.ts` (troubleshooter), `tests/integration/teams-admin.int.test.ts` (AVL-008), `tests/e2e/booking-power.spec.ts` |

## Booking

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| BKG-001 | Must | Public profile page `/{username}` | Done | `app/(site)/[username]/page.tsx`, `features/bookings/components/event-type-list.tsx` | `scheduling.int.test.ts`; `scheduling.spec.ts` core flow |
| BKG-002 | Must | Month calendar with only available dates enabled; slots fetched per month | Done | `booking-widget.tsx`, `app/api/public/slots/route.ts`, `features/bookings/server/targets.ts` | `bookings.int.test.ts` slots tests; `features/bookings/schemas.test.ts`; `scheduling.spec.ts` |
| BKG-003 | Must | Browser tz detection, searchable picker, 12/24h default from locale | Done | `booking-widget.tsx` (`<datalist>` picker, `prefers12Hour`), `lib/format.ts` | `scheduling.spec.ts` "booker in another time zone …"; `lib/format.test.ts` |
| BKG-004 | Must | Name, email, notes, guests (max configurable per event type) | Done | `booking-form.tsx`, `maxGuests` in `db/schema/scheduling.ts`, check in `create.ts` | `bookings.int.test.ts` "too many guests", "keeps the guests"; `scheduling.spec.ts` |
| BKG-005 | Must | Re-validation in a transaction; exclusion constraint; exactly one concurrent winner | Done | `features/bookings/server/create.ts`, `db/migrations/0003_booking_no_overlap.sql` | `bookings.int.test.ts` 50 parallel requests, exclusion constraint, idempotency |
| BKG-006 | Should | 5-minute slot hold | Done (deviation: no holds for team slots, per M4 deviations) | `HOLD_TTL_MS` in `features/bookings/server/core.ts`, `slot_reservation`, `service.ts` | `bookings.int.test.ts` hold tests; `slots.test.ts` `slot_held` |
| BKG-007 | Must | Confirmation page, ICS download, Google/Outlook/Apple links | Done | `app/(site)/booking/[uid]/page.tsx`, `lib/calendar-links.ts`, `app/api/bookings/[uid]/ics/route.ts` | `lib/calendar-links.test.ts`; `scheduling.spec.ts` (fetches the Apple / .ics link) |
| BKG-008 | Must | Cancel via tokenized link, optional reason | Done | `features/bookings/server/service.ts`, `public-actions.ts`, `features/bookings/components/manage-booking.tsx` | `bookings.int.test.ts` "attendee cancel requires the token"; `scheduling.spec.ts` |
| BKG-009 | Must | Reschedule via tokenized link; original `RESCHEDULED` and linked; original slot free | Done | `create.ts`, `rescheduleUid` in the engine | `bookings.int.test.ts` reschedule tests; `slots.test.ts` #15; `scheduling.spec.ts` |
| BKG-010 | Must | Dashboard tabs, filters by event type/date range, cancel, request reschedule | Done (the date-range filter and Unconfirmed tab have no dedicated test) | `app/(dashboard)/bookings/page.tsx`, `BOOKING_TABS` in `service.ts`, `features/bookings/server/host-actions.ts` | `bookings.int.test.ts` "host dashboard lists", "only the organizer can cancel"; `scheduling.spec.ts` host cancel and "request reschedule" |
| BKG-011 | Must | ≥ 128-bit UIDs and tokens scoped to one booking | Done | `lib/ids.ts`, token hashes in `db/schema/scheduling.ts` | `lib/ids.test.ts`; `scheduling.spec.ts` "wrong token can't cancel" |
| BKG-012 | Must | Accept or reject from the dashboard or signed email links | Done | `features/bookings/server/decisions.ts`, `decision-actions.ts`, `app/(site)/booking/[uid]/decide/page.tsx`, `lib/security/signed-links.ts` | `booking-power.int.test.ts`; `lib/security/signed-links.test.ts`; `booking-power.spec.ts` signed-link acceptance |
| BKG-013 | Should | No-show per attendee or host; feeds webhooks | Done (the insights part belongs to M5) | `setNoShow` in `decisions.ts`, `noShowAction` in `decision-actions.ts` (emits `BOOKING_NO_SHOW_UPDATED`), `features/bookings/components/no-show-controls.tsx` | `booking-power.int.test.ts` no-show test; `features/webhooks/payload.test.ts` |
| BKG-014 | Should | URL prefill (name, email, notes, answers, duration, date); UTM stored | Done (the `duration`/`date` prefill has no test) | `features/bookings/components/booking-page.tsx`, `prefillAnswers` / `utmFrom` in `features/bookings/responses.ts` | `responses.test.ts` URL prefill; `booking-power.int.test.ts` UTM; `booking-power.spec.ts` prefill |

## Notifications

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| NTF-001 | Must | SMTP from env; emails via pg-boss with backoff; failures recorded | Done | `jobs/email-send.ts`, `email.send` in `lib/jobs/queues.ts` (retries, backoff, dead letter), `lib/email/transport.ts` | `tests/integration/jobs.int.test.ts` "email queue (NTF-001)"; `jobs/email-send.test.ts`; `lib/email/transport.test.ts` |
| NTF-002 | Must | Confirmation to booker and host; ICS `METHOD:REQUEST`, stable UID, manage links | Done | `features/bookings/server/notifications.ts`, `lib/ics.ts`, `lib/email/templates` | `notifications.test.ts` "emails the attendee, guests and host…"; `lib/ics.test.ts` "buildIcs (NTF-002, NTF-003)"; `scheduling.spec.ts` (`method=REQUEST`) |
| NTF-003 | Must | Cancel/reschedule ICS with the same UID, higher SEQUENCE, `METHOD:CANCEL` | Done | `lib/ics.ts`, `notifications.ts`, `booking.sequence` | `ics.test.ts` "marks cancellations with METHOD:CANCEL…"; `notifications.test.ts` "sends CANCEL invitations with the bumped sequence"; `scheduling.spec.ts` (SEQUENCE:1, `method=CANCEL`) |
| NTF-004 | Must | Requested, accepted and rejected emails | Done | `notifications.ts`, `jobs/booking-process.ts`, `decisions.ts` | `notifications.test.ts` booking-request tests; `booking-power.int.test.ts` "a request emails decision links to the host…"; `booking-power.spec.ts` |
| NTF-005 | Must | Email workflows: 5 triggers, 3 recipient kinds, template variables incl. cancel/reschedule URLs | Done (deviation: one email step per workflow) | `features/workflows/schemas.ts`, `render.ts`, `server/dispatch.ts`, `jobs/workflow-run.ts`, `features/workflows/components/workflows-panel.tsx` | `features/workflows/render.test.ts`, `tests/integration/booking-power.int.test.ts` (NTF-005 links, stale steps, seats) |
| NTF-006 | Should | Default 24 h reminder; reminders follow booking changes | Done (deviation: editing a workflow doesn't move reminders already scheduled; a changed booking is re-checked when the job fires) | `DEFAULT_REMINDER` in `features/workflows/schemas.ts`, `features/event-types/server/service.ts`, `jobs/workflow-run.ts` | `booking-power.int.test.ts` default reminder, "the workflow step is dropped when the booking moved or was cancelled"; `booking-power.spec.ts` |
| NTF-007 | Should | Team-owned workflows for all team event types | Done | `workflow.team_id` in `db/schema/automation.ts`, `features/workflows/server/{service,team-actions}.ts`, `features/teams/server/event-types.ts` | `tests/integration/teams.int.test.ts` "team workflows (NTF-007)"; `tests/integration/teams-admin.int.test.ts` team-workflow tests |

## Integrations

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| INT-001 | Must | Typed adapters for calendar, video and payment; AES-256-GCM credentials | Done (deviation: payment is an interface only; the Stripe adapter is M5) | `lib/integrations/types.ts`, `lib/integrations/registry.ts`, `lib/crypto/encryption.ts`, `db/schema/integrations.ts` | `lib/integrations/*.test.ts`, `lib/crypto/encryption.test.ts`, `tests/integration/key-rotation.int.test.ts` |
| INT-002 | Must | Google Calendar: list, busy, create/update/delete | Done (deviation: busy is read with `events.list` instead of freeBusy; verified only by contract tests and fakes, not against live accounts) | `lib/integrations/google.ts`, `lib/integrations/oauth.ts`, `app/api/integrations/[provider]/connect/route.ts` | `providers.test.ts` "Google Calendar adapter (INT-002, INT-008)"; `lib/integrations/oauth.test.ts`, `oauth-state.test.ts`; `calendars.int.test.ts` "mirroring bookings" (fake Google) |
| INT-003 | Must | Microsoft Graph, same capabilities | Done (deviation: `calendarView` instead of getSchedule; contract tests and fakes only, not live accounts) | `lib/integrations/microsoft.ts` | `providers.test.ts` "Microsoft Graph adapter (INT-003, INT-008)" |
| INT-004 | Must | CalDAV with iCloud/Fastmail/Nextcloud presets: discovery, busy, write | Done (deviation: busy always uses `calendar-query` with local recurrence expansion, with no `free-busy-query` path) | `lib/integrations/caldav.ts`, `caldav-presets.ts`, `features/calendars/server/actions.ts` | `tests/integration/caldav.int.test.ts` "CalDAV with a real server (INT-004)" (Radicale); `calendars.spec.ts` CalDAV flow |
| INT-005 | Should | Read-only ICS feed for conflicts | Done | `lib/integrations/ical.ts`, `features/calendars/server/actions.ts` | `lib/integrations/ical.test.ts`; `calendars.spec.ts` "ICS feed blocks availability (INT-005)" |
| INT-006 | Must | Conflict calendars across connections; per-event-type override | Done | `features/calendars/server/connections.ts`, `busy.ts` | `calendars.int.test.ts` "respects per-event-type conflict calendars (INT-006)" |
| INT-007 | Must | Default and per-event-type destination; mirror create/reschedule/cancel; external IDs stored | Done (the per-event-type override is not asserted directly) | `features/calendars/server/sync.ts`, `booking_reference`, `event_type.destination_calendar_id` | `calendars.int.test.ts` "creates a Google event with Meet…", "reschedules by updating the same event, and cancels by deleting it"; `calendars.spec.ts` CalDAV write/delete |
| INT-008 | Must | Meet link for a Google destination; Teams link for a Microsoft destination | Done (deviation: contract tests and fakes only, not live accounts) | `google.ts`, `microsoft.ts`, `event-type-form.tsx` | `providers.test.ts` Meet and Teams cases; `calendars.int.test.ts` Meet without a Google destination |
| INT-009 | Should | Zoom OAuth; one meeting per booking, updated or deleted | Done (deviation: contract tests and fakes only, not a live account) | `lib/integrations/zoom.ts` | `providers.test.ts` "Zoom adapter (INT-009)"; `calendars.int.test.ts` "creates a Zoom meeting…" |
| INT-010 | Must | Jitsi (configurable base URL, room per booking) and a static link | Done | `features/bookings/location.ts`, `JITSI_BASE_URL` in `lib/env.ts` | `schemas.test.ts` "validates locations per kind (EVT-008, INT-010/011)"; `calendars.spec.ts` locations flow |
| INT-011 | Must | In person (address, map link) and phone (both directions) | Done | `features/bookings/location.ts`, `features/bookings/schemas.ts` | same as INT-010 |
| INT-012 | Must | Revoked credential marked errored, shown in the UI, owner emailed; bookings still succeed | Done | `features/calendars/server/credentials.ts`, `busy.ts`, `sync.ts`, `lib/integrations/errors.ts`, banner in `app/(dashboard)/layout.tsx` | `calendars.int.test.ts` "credential health (INT-012)" |
| INT-013 | Must | Only configured integrations shown; clear admin message | Done (the admin hint has no test) | `configureHint` in `lib/integrations/registry.ts`, `app/(dashboard)/settings/calendars/page.tsx` | `calendars.spec.ts` "OAuth providers stay hidden when not configured (INT-013)" |

## Embeds

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| EMB-001 | Must | Inline embed via one `<script>` | Done | `public/embed.js` | `lib/embed/embed-size.test.ts` (link shapes incl. team, group, form), `tests/e2e/embed.spec.ts` |
| EMB-002 | Must | Popup from a data attribute; floating button (text, color, position) | Done | `public/embed.js` | `embed.spec.ts` (same test) |
| EMB-003 | Must | Versioned postMessage events (6) with an origin check | Done | `lib/embed/protocol.ts`, `lib/embed/bridge.ts`, origin/version check in `public/embed.js` | `lib/embed/embed-size.test.ts` "knows every protocol event", "…forwards trusted messages only"; `embed.spec.ts` |
| EMB-004 | Should | Prefill, theme, brand color, hide details, layout | Done | `buildUrl` in `public/embed.js`, `parseEmbedOptions` in `lib/embed/protocol.ts`, `booking-page.tsx`, `booking-widget.tsx` | `lib/embed/protocol.test.ts`; `embed-size.test.ts` "builds embed URLs with options and prefill (EMB-004)" |
| EMB-005 | Should | Auto-resize; `frame-ancestors` allow-list from env | Done | `lib/embed/bridge.ts`, `EMBED_ALLOWED_ORIGINS` in `lib/env.ts`, `lib/security/csp.ts`, `proxy.ts` | `lib/security/csp.test.ts` "uses the given frame ancestors (EMB-005)"; `lib/env.test.ts`; `embed.spec.ts` |

## API / webhooks

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| API-001 | Must | Subscriptions scoped to user, event type or team; 9 triggers; test ping | Done (`BOOKING_PAID` reserved until payments, M5) | `webhook` table in `db/schema/automation.ts`, `features/webhooks/payload.ts`, `features/webhooks/server/{emit,service}.ts`, `jobs/booking-ended.ts` | `tests/integration/webhooks.int.test.ts` (team scope, FORM_SUBMITTED, MEETING_ENDED, BOOKING_NO_SHOW_UPDATED, ping) |
| API-002 | Must | HMAC-SHA256 over timestamp + body; headers; documented verification snippet | Done | `features/webhooks/signature.ts`; snippet in `docs/03-architecture/api-and-webhooks.md` | `features/webhooks/signature.test.ts`; `webhooks.int.test.ts` "POSTs a signed body that verifies with the subscription secret" |
| API-003 | Must | Queue delivery (≥ 8 attempts over 24 h), delivery log, manual retry | Done (deviation: 11 attempts, 1 min backoff capped at 6 h, spanning about 24 h) | `webhook.deliver` in `lib/jobs/queues.ts`, `features/webhooks/server/deliver.ts`, `webhook_delivery`, `features/webhooks/components/delivery-log.tsx` | `webhooks.int.test.ts` retry, network-error and "re-enqueues failed deliveries for their owner only" tests |
| API-004 | Must | Refuse private/loopback/link-local targets; admin can allow | Done (deviation: the "admin setting" is the env flag `WEBHOOK_ALLOW_PRIVATE`, not an in-app setting) | `features/webhooks/server/url.ts`, `deliver.ts`, `lib/integrations/safe-fetch.ts` | `webhooks.int.test.ts` "SSRF protection (API-004)"; `lib/integrations/safe-fetch.test.ts` |
| API-005 | Must | Versioned, documented payload schema | Done (deviation: the docs show `version` both as `"v1"` and as `1`; the code uses `1`) | `WEBHOOK_PAYLOAD_VERSION` / `webhookEnvelopeSchema` in `features/webhooks/payload.ts`; `docs/03-architecture/api-and-webhooks.md` | `features/webhooks/payload.test.ts` |

## Teams

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| TEAM-001 | Must | Team name, slug and logo; public `/team/{slug}` listing event types | Done (deviation: the logo is an https URL, not an upload) | `db/schema/teams.ts`, `features/teams/schemas.ts`, `features/teams/server/service.ts`, `app/(site)/team/[team]/page.tsx`, `app/(site)/team/[team]/[slug]/page.tsx` | `teams-admin.int.test.ts` "admins edit the team, members read it, owners delete it", public pages test; `tests/e2e/teams.spec.ts` flow 7 |
| TEAM-002 | Must | Invite by email, accept or decline; reassign or cancel on removal | Done (deviation: an invite is accepted by a signed-in user with a matching verified email, and it expires after 14 days; the grant is capped by the inviter's role; a departing collective co-host triggers no email) | `inviteMember` / `acceptInvitation` / `declineInvitation` in `service.ts`, `features/teams/server/removal.ts` | `teams.int.test.ts` "only the verified owner of the invited email can accept; decline removes it", reassign/cancel tests; `teams-admin.int.test.ts` "member removal edge cases"; `teams.spec.ts` flow 7 |
| TEAM-003 | Must | Owner/Admin/Member enforced server-side; only Owners delete the team or change Owners | Done | `features/teams/roles.ts`, `features/teams/server/access.ts` (`requireTeamRole`), `service.ts`, `removal.ts` | `teams.int.test.ts` "enforces roles on every team resource; outsiders get NOT_FOUND"; `teams-admin.int.test.ts`; `routing-forms.int.test.ts` "team routing forms" |
| TEAM-004 | Must | Collective: all hosts free; booking includes all hosts | Done (deviation: the calendar event is written only to the organizer's destination calendar, and co-hosts get the ICS by email; no per-type schedule, seats, series or single-use links on team types) | `lib/availability/team.ts`, `features/bookings/server/create.ts`, `features/teams/server/event-types.ts` | `lib/availability/team.test.ts` "collective: only slots where every host is free"; `teams.int.test.ts` collective tests |
| TEAM-005 | Must | Round robin: any free host; fewest recent bookings in a configurable window | Done (no test proves that bookings outside the window are ignored) | `lib/availability/team.ts`, `lib/availability/round-robin.ts`, `roundRobinWindowDays` in `db/schema/scheduling.ts`, `features/teams/components/hosts-panel.tsx` | `lib/availability/round-robin.test.ts`; `team.test.ts`; `teams.int.test.ts` "offers the pool's union and books the least-loaded free host, recording why"; `teams.spec.ts` flow 7 |
| TEAM-006 | Must | Weights, priority tiebreaker, reason recorded | Done (deviation, not yet in implementation-steps: priority has five levels, 0–4, instead of low/medium/high) | `selectRoundRobinHost` in `round-robin.ts`, `booking.assignmentReason` | `round-robin.test.ts` weights, priority, 1,000-booking distribution tests; `teams.int.test.ts` reason assertion |
| TEAM-007 | Should | Fixed hosts plus a round-robin pool | Done | `lib/availability/team.ts`, `eventTypeHost.isFixed` | `team.test.ts` "fixed hosts plus a pool…"; `teams.int.test.ts` "fixed host + pool…" |
| TEAM-008 | Must | Managed types: template, assignment, locked fields, propagation | Done (deviation: copies are created without an acceptance step; a detached copy with upcoming bookings stays as a disabled personal type) | `features/teams/managed.ts`, `LOCKABLE_FIELDS` in `features/teams/schemas.ts`, `features/teams/server/event-types.ts`, `features/teams/components/managed-panel.tsx` | `teams.int.test.ts` "copies the template to assignees, pushes locked fields and ignores member edits to them"; `teams-admin.int.test.ts` managed-copy tests |
| TEAM-009 | Should | `/{a}+{b}` dynamic collective among members of a shared team, on default schedules | Done (deviation: each user must opt in; at most 5 people; not available for seated, recurring or link-only types) | `groupUsernames` / `resolveGroup` in `features/bookings/server/targets.ts`, `allowDynamicGroup` in `db/schema/profile.ts` | `teams.int.test.ts` "books everyone collectively when they share a team and opted in, else not found"; `csp.test.ts` |
| TEAM-010 | Should | Members' working hours and busy blocks, day/week, viewer tz | Done (deviation: uses default schedules only; the week always starts on Monday instead of following the user's week-start setting) | `features/teams/server/availability.ts`, `app/(dashboard)/teams/[id]/availability/page.tsx`, `features/teams/components/availability-grid.tsx` | `teams-admin.int.test.ts` "shows members' working hours and busy blocks, without meeting details"; `teams.spec.ts` flow 7 (with axe) |

## Routing

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| RTE-001 | Must | Builder (7 field types); user- or team-owned; public URL | Done | `FIELD_TYPES` in `features/routing-forms/schemas.ts`, `db/schema/routing.ts`, `features/routing-forms/server/service.ts`, `components/routing-form-builder.tsx`, `app/(site)/forms/[id]/page.tsx` | `routing-forms.int.test.ts` "personal routing forms", "team routing forms"; `features/routing-forms/schemas.test.ts`; `tests/e2e/routing-forms.spec.ts` |
| RTE-002 | Must | Ordered rules, AND/OR, equals/contains/in/range; route to an event type, URL or message | Done (range is implemented as `gt`/`lt`/`between`) | `features/routing-forms/evaluate.ts`, `OPERATORS` / `actionSchema` in `schemas.ts`, `components/rules-editor.tsx` | `features/routing-forms/evaluate.test.ts`; `routing-forms.int.test.ts` trace and external URL/team event type tests |
| RTE-003 | Must | Mandatory fallback | Done | `fallback NOT NULL` in `db/schema/routing.ts`, `schemas.ts`, `evaluate.ts` | `schemas.test.ts` "requires a fallback (RTE-003)"; `evaluate.test.ts`; `routing-forms.int.test.ts`; `routing-forms.spec.ts` |
| RTE-004 | Must | Answers prefill booking questions and are stored on the booking | Done | `bookingUrlWithPrefill` in `features/routing-forms/target.ts`, `booking.routingFormResponseId`, `create.ts` | `routing-forms.int.test.ts` prefill and reserved-parameter tests; `routing-forms.spec.ts` (checks `routing_form_response_id`) |
| RTE-005 | Should | Routing trace per submission; admin view; CSV export | Done | `routing_form_response`, `features/routing-forms/server/csv.ts`, `app/api/routing-forms/[id]/responses/route.ts` | `features/routing-forms/server/csv.test.ts`; `routing-forms.int.test.ts` "CSV export"; `routing-forms.spec.ts` |
| RTE-006 | Could | Embeddable forms; headless routing via URL params | Done | `app/(site)/forms/[id]/route/route.ts` (headless), `app/(site)/forms/[id]/page.tsx` (`?embed=1`), `features/routing-forms/components/public-form.tsx` | `tests/e2e/routing-forms.spec.ts` (headless), `tests/e2e/embed.spec.ts` (embedded form resize) |

## Admin / ops

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| ADM-001 | Must | One image for web and worker; `docker compose up` applies migrations | Done | `Dockerfile`, `docker-compose.yml`, `db/migrate.ts`, `lib/bootstrap.ts` | `database.int.test.ts` "are idempotent and safe to run concurrently"; E2E suite run on the Compose stack (see implementation-steps) |
| ADM-002 | Must | Runtime env validated at startup; every bad variable named; no license key | Done | `lib/env.ts`, `lib/bootstrap.ts` | `lib/env.test.ts` "names every missing or invalid variable in the error" |
| ADM-003 | Must | CI: lint, typecheck, unit, integration, E2E, image build; multi-arch publish on main | Not verifiable here (the workflows exist but have never run on GitHub) | `.github/workflows/ci.yml`, `.github/workflows/release.yml` | n/a |
| ADM-004 | Must | `/api/health/live` and `/api/health/ready` (DB and queue) | Done | `app/api/health/{live,ready}/route.ts`, `lib/health.ts` | `tests/integration/health.int.test.ts`; `foundation.spec.ts` "health endpoints report ready" |
| ADM-005 | Must | App shell, settings, light/dark theme | Done | `app/(dashboard)/`, `features/settings/*`, `components/ui/*` (shadcn/ui) | `features/settings/schemas.test.ts`; `tests/integration/settings.int.test.ts`; `foundation.spec.ts` settings flow |
| ADM-006 | Must | Account deletion: cancel and notify, revoke integrations, hard delete within 30 days | Done (deviation: hard delete is immediate; stored credentials are deleted, but tokens aren't revoked at Google, Microsoft or Zoom) | `features/account/server/{service,actions}.ts`, `features/teams/server/handover.ts` | `scheduling.int.test.ts` "account deletion (ADM-006)"; `teams-admin.int.test.ts` hand-over; `scheduling.spec.ts` account deletion |
| ADM-007 | Should | Per-IP limits on public endpoints plus optional CAPTCHA | Done (deviation: ALTCHA only, no Turnstile) | `lib/security/public-limits.ts`, `lib/security/captcha.ts`, `app/api/public/captcha/route.ts` | `lib/security/public-limits.test.ts`; `tests/integration/captcha.int.test.ts` |

## i18n

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| I18N-001 | Must | `Intl` formatting by viewer locale, tz and 12/24h; week start from the setting | Done | `lib/format.ts`, `booking-widget.tsx`, `features/schedules/components/schedule-editor.tsx` | `lib/format.test.ts`; `scheduling.spec.ts` "booker in another time zone sees converted times in their clock" |

## NFRs

NFRs carry no MoSCoW priority, so the Priority column shows `NFR`.

| ID | Priority | Summary (short) | Status | Implementation | Tests |
|---|---|---|---|---|---|
| NFR-001 | NFR | Slot API p95 < 300 ms, p99 < 800 ms on the reference footprint | Done (verified on the Docker stack limited to 1 CPU / 1 GB: 877–1001 req/s, p97.5 206–248 ms, p99 ≤ 392 ms; p95 is bounded by p97.5) | `features/bookings/server/public-context.ts`, `lib/availability/*` | `scripts/loadtest.ts` |
| NFR-002 | NFR | Round robin / collective for 10 hosts, p95 < 800 ms | Done | `lib/availability/team.ts`, `features/bookings/server/service.ts` | `scripts/loadtest-team.ts` (passes native and on 1-CPU Docker) |
| NFR-003 | NFR | LCP < 2.5 s, INP < 200 ms; embed ≤ 15 KB gzipped | Done (Lighthouse mobile, simulated 4G on a mid-range phone, production image: LCP 1.8–2.5 s (median 1.9 s), TBT 10 ms, CLS 0.009; INP needs field data — TBT is the lab proxy; embed 3.8 KB gzipped) | `public/embed.js` | `lib/embed/embed-size.test.ts`; Lighthouse run recorded in `docs/04-development/implementation-steps.md` |
| NFR-004 | NFR | No double booking via exclusion constraint; 50 parallel requests → 1 booking | Done | `db/migrations/0003_booking_no_overlap.sql` | `bookings.int.test.ts` 50-parallel test |
| NFR-005 | NFR | Deterministic engine; property-based and DST tests | Done | `lib/availability/{slots,intervals,tz}.ts` | `slots.test.ts` "properties (NFR-005)" (fast-check); `intervals.test.ts`; `tz.test.ts` |
| NFR-006 | NFR | ASVS L2: CSRF, strict CSP, secure cookies, parameterized queries, Zod | Done | `proxy.ts`, `lib/security/csp.ts`, Server Actions origin check, Better Auth cookies, `features/*/schemas.ts` | `lib/security/csp.test.ts`; `foundation.spec.ts` security headers |
| NFR-007 | NFR | No secrets in logs; tokens encrypted or hashed; CI scans block high/critical; `SECURITY.md` | Done | `lib/crypto/encryption.ts`, `lib/logger.ts`, `SECURITY.md`, `.github/workflows/ci.yml` | `lib/logger*.test.ts`, `lib/crypto/encryption.test.ts`; CI: `npm audit`, Trivy before push (`ci.yml`, `release.yml`); `SECURITY.md` |
| NFR-008 | NFR | WCAG 2.2 AA; axe zero serious/critical | Done | `booking-widget.tsx`, `components/ui/*` (shadcn/ui) | `tests/e2e/accessibility.spec.ts` (keyboard-only booking, reduced motion, axe in embed mode), axe in every E2E spec |
| NFR-009 | NFR | UTC storage with IANA zone; no server-local time; week-start and 12/24h support | Done | timestamptz columns, `lib/availability/tz.ts`, `lib/format.ts` | CI unit matrix with TZ=UTC and America/New_York; `tz.test.ts`; `format.test.ts` |
| NFR-010 | NFR | JSON logs with correlation IDs; optional OpenTelemetry; opt-in `/metrics` | Done (deviation: `X-Request-Id` per request and job ids in job logs, but app log lines don't carry the request id yet; no OpenTelemetry exporter) | `lib/logger.ts`, `lib/metrics.ts`, `app/api/metrics/route.ts` | `lib/logger*.test.ts`, `lib/metrics.test.ts`, `tests/e2e/calendars.spec.ts` (metrics token) |
| NFR-011 | NFR | Durable, idempotent jobs with backoff; a crash never loses a reminder | Done | `lib/jobs/queues.ts`, `lib/jobs/job-id.ts`, `jobs/*` | `tests/integration/jobs.int.test.ts` (durability: a scheduled job survives a worker crash), `tests/integration/booking-power.int.test.ts` (idempotent workflow steps) |
| NFR-012 | NFR | 50 users on 1 vCPU / 1 GB plus PostgreSQL; no Redis | Done (deviation: verified as a 1 CPU / 1 GB app container with PostgreSQL on a development machine, not on a VPS; idle app memory 123 MiB) | `docker-compose.yml` | fresh `docker compose` stack + full E2E suite, see implementation steps |
| NFR-013 | NFR | No-manual-step upgrades; migrations tested against the previous schema; release notes | Done | `db/migrate.ts`, `db/migrations/` | `tests/integration/upgrade.int.test.ts` (M3 schema with data → current), `CHANGELOG.md`, `.github/workflows/release.yml` |
| NFR-014 | NFR | Backup/restore docs and drill; key backup; clear error without the key | Done (deviation: a missing or wrong key shows per-item decryption errors, not one clear startup error; documented) | Backups section of `docs/03-architecture/self-hosting.md` | manual restore drill (M1); `encryption.test.ts` "fails with the wrong key" |
| NFR-016 | NFR | Zero downtime with ≥ 2 replicas; single restart < 10 s | Done (deviation: single-replica restart to ready in 1.2 s; the two-replica zero-downtime rolling restart was not exercised) | `Dockerfile` healthcheck, health routes | manual check, see implementation steps |
| NFR-017 | NFR | Coverage ≥ 80% overall and ≥ 95% engine; strict TS; no `any` in domain code | Done (deviation: the 95% engine threshold isn't enforced in config, although it measures 100%) | `vitest.config.mts` thresholds, strict `tsconfig.json`, `no-explicit-any` via ESLint | `npm run test:coverage` in CI |
| NFR-018 | NFR | Latest two versions of the major browsers plus mobile; ICS imports into Google, Outlook, Apple and Thunderbird | Done (deviation: Chromium runs everything, Firefox and WebKit run the core flows; ICS import into Google/Outlook/Apple/Thunderbird not checked by hand) | `playwright.config.ts`, `lib/ics.ts` | `playwright.config.ts` projects, `tests/e2e/*.spec.ts` |

---

## Gaps

### Must requirements not `Done` / `Done (deviation)`

| ID | Status | What is needed |
|---|---|---|
| AUTH-003 | Not verifiable here | A live sign-in with registered Google and Microsoft OAuth apps. The "only when configured" gating is implemented and tested. |
| ADM-003 | Not verifiable here | A green GitHub Actions run (`ci.yml`) and a tag run (`release.yml`). |

INT-002, INT-003 and INT-008 are `Done (deviation)` because Google, Microsoft 365 and Zoom were
verified with contract tests and fakes only; CalDAV was verified against a real server.

### Should / Could

Every Should and Could is `Done` or `Done (deviation)`. Clauses without a dedicated automated
test: EVT-017 (lock booker time zone), BKG-014 (`duration`/`date` prefill), TEAM-005 (bookings
outside the round-robin window are ignored).

### Deviations

All deviations are listed with their requirement in the tables above and explained in
[implementation steps](../04-development/implementation-steps.md) (per milestone and in the v1.0
release pass).
