# Requirements

Functional and non-functional requirements for OpenCalendar, each with a stable ID, a priority and a target milestone.

Last updated: 2026-09-28

Related: [Vision](./vision.md) · [User flows](./user-flows.md) · [Glossary](./glossary.md) · [Data model](../03-architecture/data-model.md) · [Availability engine](../03-architecture/availability-engine.md) · [Roadmap](../05-roadmap/roadmap.md) · [Feature matrix](../01-research/feature-matrix.md)

---

## Conventions

- **IDs are stable.** Never renumber or reuse an ID. If a requirement is dropped, mark it `Withdrawn` and keep the row.
- **Priority** follows MoSCoW. **Must** blocks the milestone. **Should** is expected but may slip one milestone. **Could** is nice to have.
- **Milestone** is one of `M0`–`M6` or `Post-1.0`. See the [roadmap](../05-roadmap/roadmap.md).
- Terms such as *slot*, *buffer* and *booking horizon* are defined in the [glossary](./glossary.md).
- Each requirement must be verifiable by an automated test, or by a documented manual check where automation isn't practical (for example, OAuth consent screens).

---

## AUTH: Authentication and accounts

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| AUTH-001 | Users can sign up and sign in with email and password. They must verify their email before publishing a booking page, and they can reset a forgotten password with a single-use link that expires after 60 minutes. | Must | M0 |
| AUTH-002 | Users can sign in with a magic link sent by email. The link is single-use and expires after 15 minutes. | Must | M0 |
| AUTH-003 | Users can sign in with Google and Microsoft OAuth. Each provider is enabled only when its client ID and secret are present in the runtime configuration. | Must | M0 |
| AUTH-004 | Sign-in, magic-link and password-reset endpoints are rate-limited per IP and per account. After 10 failed attempts in 15 minutes, the account is temporarily locked. | Must | M0 |
| AUTH-005 | An instance-level signup mode (`open`, `invite-only`, `disabled`) is set in runtime config. On first run, the first registered user becomes the instance admin. | Must | M0 |
| AUTH-006 | Users can enable TOTP two-factor authentication and get one-time recovery codes. Admins can require 2FA for all users. | Should | M6 |
| AUTH-007 | Admins can configure OIDC and SAML 2.0 SSO. This includes JIT user provisioning, mapping by email domain to a team, and optionally disabling password login for SSO domains. | Should | M6 |
| AUTH-008 | SCIM 2.0 user and group provisioning. | Could | Post-1.0 |

## AVL: Availability

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| AVL-001 | A user can create multiple named schedules. Each schedule has an IANA timezone and a weekly set of time ranges, with multiple ranges allowed per day. One schedule is the default, and each event type can use either the default or a specific schedule. | Must | M1 |
| AVL-002 | A user can add date overrides that replace the weekly hours for a specific date, either with custom ranges or as fully unavailable. | Must | M1 |
| AVL-003 | The availability engine produces bookable slots from schedule, overrides, existing bookings (with buffers), minimum notice, booking horizon and slot interval. The engine is a pure function with no I/O. | Must | M1 |
| AVL-004 | Slot computation handles DST correctly. A slot never starts inside a nonexistent local time, and ambiguous local times resolve deterministically. Fixture tests cover at least 10 timezones, including half-hour and 45-minute offsets. | Must | M1 |
| AVL-005 | For each candidate slot it excludes, the engine returns machine-readable reason codes (for example `OUTSIDE_WORKING_HOURS`, `BUSY_BOOKING`, `BUSY_CALENDAR`, `BUFFER`, `MIN_NOTICE`, `BEYOND_HORIZON`, `LIMIT_REACHED`, `OOO`). | Should | M1 |
| AVL-006 | Busy times from all selected conflict calendars are merged into the busy set before slots are computed. | Must | M2 |
| AVL-007 | Calendar busy times are cached per calendar and time range. The cache is invalidated by provider push notifications where available (Google, Microsoft) and otherwise by polling at a configurable interval (default 5 min for CalDAV). | Must | M2 |
| AVL-008 | An availability explainability debug view lets a host (or a team admin, for team members) pick a date and event type and see every candidate slot with its status, its reason codes and the source object (booking, calendar event title if permitted, rule). | Must | M3 |
| AVL-009 | Out-of-office (OOO) entries with a date range, a reason and an optional redirect to another user. The booking page shows the OOO notice and a link to the redirect user. | Must | M5 |
| AVL-010 | Users can opt in to public holidays for a selected country. Those holidays are treated as unavailable, with individual holidays toggleable. | Should | M5 |
| AVL-011 | Travel schedules temporarily override the schedule timezone for a date range. | Should | M5 |

## EVT: Event types

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| EVT-001 | Users can create, edit, enable/disable, duplicate, reorder and delete event types. Each has a title, a URL slug unique per owner, a Markdown description and a duration in minutes. | Must | M1 |
| EVT-002 | An event type can offer multiple selectable durations (for example 15/30/60), with one default. The booker chooses the duration on the booking page. | Must | M1 |
| EVT-003 | An event type can have a buffer before and a buffer after, in minutes. Buffers block the host's time for every event type the host owns. | Must | M1 |
| EVT-004 | An event type has a minimum notice (minutes, hours or days). Slots that start earlier than now plus the minimum notice are not offered. | Must | M1 |
| EVT-005 | An event type has a booking horizon: rolling N calendar days, rolling N business days, a fixed date range, or unlimited. | Must | M1 |
| EVT-006 | An event type has a slot interval that sets how far apart start times are. It defaults to the event duration. | Must | M1 |
| EVT-007 | An event type has a single basic location: free-text address, phone number or URL. The location appears in emails and in the ICS file. | Must | M1 |
| EVT-008 | An event type can offer multiple typed locations (video provider, in person, phone, link). The booker picks one if there is more than one. | Must | M2 |
| EVT-009 | A form builder for custom booking questions. Supported types are short text, long text, number, email, phone, select, multi-select, radio, checkbox, boolean and URL. Each question can be required, hidden or optional, and name and email are always present. | Must | M3 |
| EVT-010 | Frequency limits (bookings per day/week/month/year) and duration limits (total booked minutes per period) per event type. Once a limit is reached, the engine excludes the affected slots with `LIMIT_REACHED`. | Must | M3 |
| EVT-011 | Requires confirmation. New bookings are created as `PENDING` until the host accepts them. This can optionally apply only when a booking starts within N hours. | Must | M3 |
| EVT-012 | Seats. Up to N attendees can book the same slot. The slot stays available until it is full, and the host can hide attendees from each other. | Must | M3 |
| EVT-013 | Recurring events. The host allows weekly or monthly recurrence with a maximum occurrence count, and the booker picks how many occurrences to book. | Should | M3 |
| EVT-014 | Hidden event types. They don't appear on the profile page but can be booked through their direct URL. | Must | M3 |
| EVT-015 | Single-use private links. They let the holder book a hidden or visible event type once, can expire on a date, and are invalidated after use. | Should | M3 |
| EVT-016 | Redirect after booking. The booker is sent to an external URL, optionally with booking details appended as query parameters. | Should | M3 |
| EVT-017 | Per-event-type booking policies: custom event name template, disable cancel/reschedule for bookers, cancellation cutoff (no self-service cancel within N hours of start), and lock booker timezone. | Should | M3 |
| EVT-018 | One-off meetings. The host picks specific candidate times and generates a link that disappears after one booking. | Should | M5 |
| EVT-019 | Meeting polls. The host proposes times, invitees vote without an account, and the host (or an automatic rule) books the winning time for all participants. | Should | M5 |

## BKG: Booking flow

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| BKG-001 | A public profile page at `/{username}` lists the user's enabled, non-hidden event types with title, duration and description. | Must | M1 |
| BKG-002 | The booking page `/{username}/{slug}` shows a month calendar where only dates with at least one slot are enabled, plus a slot list for the selected date. Slots are fetched per visible month. | Must | M1 |
| BKG-003 | The booking page detects the booker's timezone from the browser, lets them change it with a searchable picker, and offers a 12h/24h toggle. The toggle's default comes from the locale. | Must | M1 |
| BKG-004 | The booking form collects name, email, optional notes and optional additional guest emails (the maximum is configurable per event type). | Must | M1 |
| BKG-005 | Booking creation re-validates the slot inside a database transaction. A database-level exclusion constraint on a host's non-cancelled bookings prevents double booking. If two concurrent requests target the same slot, exactly one succeeds. | Must | M1 |
| BKG-006 | When the booker opens the form, the selected slot is held for 5 minutes, and other bookers see it as unavailable during the hold. | Should | M1 |
| BKG-007 | The confirmation page shows the booking details in the booker's timezone, plus an ICS download and add-to-calendar links for Google, Outlook and Apple. | Must | M1 |
| BKG-008 | The booker can cancel through a tokenized link in the email. The link doesn't require login and cancellation takes an optional reason. | Must | M1 |
| BKG-009 | The booker can reschedule through a tokenized link. The original booking becomes `RESCHEDULED` and is linked to the new one, and the original slot doesn't count as busy while choosing a new time. | Must | M1 |
| BKG-010 | The host dashboard lists bookings in Upcoming, Unconfirmed, Past and Cancelled tabs, with filters by event type and date range. From the list, the host can cancel with a reason or request a reschedule. | Must | M1 |
| BKG-011 | Booking UIDs and manage-link tokens are unguessable (at least 128 bits of entropy). Tokens are scoped to a single booking and can't be used to enumerate bookings. | Must | M1 |
| BKG-012 | The host can accept or reject pending bookings (optionally with a reason) from the dashboard or with one-click signed links in the notification email. | Must | M3 |
| BKG-013 | The host can mark individual attendees, or themselves, as no-show on past bookings. No-show status feeds insights and webhooks. | Should | M3 |
| BKG-014 | The booking page accepts URL parameters that prefill name, email, notes, booking-question answers, duration and date. UTM parameters are stored on the booking. | Should | M3 |

## NTF: Notifications and workflows

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| NTF-001 | SMTP transport is configured through runtime env. All emails are sent from a pg-boss job queue with exponential-backoff retries, and failures are recorded. | Must | M0 |
| NTF-002 | When a booking is confirmed, both booker and host get a confirmation email with an ICS attachment (`METHOD:REQUEST`, stable `UID`) and cancel and reschedule links. | Must | M1 |
| NTF-003 | Cancel and reschedule emails carry ICS updates that reuse the same `UID` with an incremented `SEQUENCE` (`METHOD:CANCEL` for cancellations), so calendar clients update the existing event. | Must | M1 |
| NTF-004 | Booking requested, accepted and rejected emails are sent for event types that require confirmation. | Must | M3 |
| NTF-005 | Email workflows. Triggers are booking created, cancelled, rescheduled, N minutes/hours before start and N after end. The action sends an email to the host, the attendees or a fixed address, using a template with variables (event name, times in recipient timezone, location, cancel/reschedule URLs, answers). | Must | M3 |
| NTF-006 | New event types include a 24-hour reminder workflow by default, which the host can disable. Scheduled reminders are rescheduled or cancelled when the booking changes. | Should | M3 |
| NTF-007 | Workflows can be owned by a team and applied to all of the team's event types. | Should | M4 |
| NTF-008 | Emails and ICS summaries are rendered in the recipient's locale (the booker's locale from the booking page, and the host's profile locale). | Should | M5 |
| NTF-009 | SMS reminders and workflow actions via Twilio. They require phone collection at booking, use E.164 validation and honor opt-out keywords. | Should | M6 |
| NTF-010 | Team admins can configure a custom SMTP sender per team, which overrides the instance SMTP for that team's emails. | Could | M6 |

## INT: Integrations

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| INT-001 | An integration adapter framework with typed interfaces for calendar, video and payment providers. Credentials are encrypted at rest (AES-256-GCM, with the key from runtime env), and core code talks to providers only through these interfaces. | Must | M2 |
| INT-002 | Google Calendar via OAuth: list calendars, read free/busy, and create, update and delete events. | Must | M2 |
| INT-003 | Microsoft 365 / Outlook.com calendars via Microsoft Graph, with the same capabilities as INT-002. | Must | M2 |
| INT-004 | Generic CalDAV with guided presets for iCloud (app-specific password), Fastmail and Nextcloud: discover calendars, read busy (`free-busy-query` or `calendar-query` fallback), and write events. | Must | M2 |
| INT-005 | Read-only ICS feed subscriptions via URL, used only for conflict checking. | Should | M2 |
| INT-006 | Users select one or more conflict calendars across all connections. Event types can optionally override which conflict calendars apply. | Must | M2 |
| INT-007 | Users set a default destination calendar, and event types can optionally override it. Booking create, reschedule and cancel are mirrored to the destination calendar, and external event IDs are stored per booking. | Must | M2 |
| INT-008 | Native conferencing: Google Meet links when the destination is Google, and Microsoft Teams links when the destination is Microsoft 365. | Must | M2 |
| INT-009 | Zoom integration via OAuth. A unique meeting is created per booking and updated or deleted on reschedule or cancel. | Should | M2 |
| INT-010 | Jitsi (configurable base URL, generated room per booking) and custom static video link locations. | Must | M2 |
| INT-011 | In-person (address, optional map link) and phone locations, where either the host calls the attendee (attendee phone collected) or the attendee calls the host. | Must | M2 |
| INT-012 | Credential health. Revoked or expired credentials are detected, marked as errored, surfaced in the UI and emailed to the owner. Bookings still succeed, and the host is warned that calendar sync failed. | Must | M2 |
| INT-013 | Only integrations whose runtime configuration is present are shown and installable. Missing configuration produces a clear admin-facing message. | Must | M2 |
| INT-014 | Zapier and n8n integrations (triggers built on webhooks, actions built on the REST API). | Could | Post-1.0 |
| INT-015 | CRM adapters (HubSpot, Salesforce, Pipedrive) that create contacts and activities from bookings. | Could | Post-1.0 |

## EMB: Embeds

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| EMB-001 | An inline embed via a single `<script>` snippet renders a profile or event-type booking page inside a host-page element. | Must | M3 |
| EMB-002 | Popup embeds: a modal opened by clicking any element with a data attribute, and a floating button with configurable text, color and position. | Must | M3 |
| EMB-003 | The embed sends documented, versioned `postMessage` events to the parent (`ready`, `dateSelected`, `slotSelected`, `bookingSuccessful`, `bookingFailed`, `dimensionsChanged`), with an origin check. | Must | M3 |
| EMB-004 | Embed config supports prefill (name, email, answers), theme (light/dark/auto), brand color, hiding event details and layout selection. | Should | M3 |
| EMB-005 | The inline embed resizes its height to fit content automatically. The instance can restrict embedding through a `frame-ancestors` allow-list set in runtime config. | Should | M3 |
| EMB-006 | An npm React wrapper component (`@opencalendar/embed-react`) with typed props and event callbacks. | Could | M5 |
| EMB-007 | An embed builder in the dashboard (event types, profile, teams, team event types, routing forms) generates inline, floating-button, popup, iframe and link code from options (theme, brand color, layout, hide details, prefill, button text/color/position) with a live preview of the real loader. | Should | M5 |
| EMB-008 | An email embed: the host picks free times of an event type and copies email-safe HTML (and plain text) in which each time links to the booking page with that time preselected. | Should | M5 |
| EMB-009 | Booking pages offer month, week and column layouts (URL `layout`, embed config, booker switcher) and accept `slot` to preselect an exact start. | Should | M5 |

## TEAM: Teams

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| TEAM-001 | Users can create teams with a name, slug, logo and public page at `/team/{slug}` that lists the team's event types. | Must | M4 |
| TEAM-002 | Team admins invite members by email. Invitees accept or decline. When a member is removed, the admin chooses how to handle that member's future team bookings: reassign or cancel. | Must | M4 |
| TEAM-003 | Roles are Owner, Admin and Member, and permissions are enforced server-side on every team resource. Only Owners can delete the team or change Owners. | Must | M4 |
| TEAM-004 | Collective event types. A slot is offered only when every assigned host is free, and the booking includes all hosts. | Must | M4 |
| TEAM-005 | Round-robin event types. A slot is offered when any assigned host is free. At booking time, the system picks a host among those free by fewest recent bookings in a configurable window. | Must | M4 |
| TEAM-006 | Round-robin weights (distribute bookings proportionally) and priority (low/medium/high tiebreaker). The reason for the chosen host is recorded on the booking. | Must | M4 |
| TEAM-007 | An event type can combine fixed hosts (always attend) with a round-robin pool. | Should | M4 |
| TEAM-008 | Managed event types. An admin defines a template, assigns it to members, and locks selected fields. Changes propagate to members' copies, and members can edit only unlocked fields. | Must | M4 |
| TEAM-009 | Dynamic group links (`/{user1}+{user2}`) create an ad-hoc collective booking among members of a shared team, using each user's default schedule. | Should | M4 |
| TEAM-010 | A team availability view shows members' working hours and busy blocks side by side for a selected day or week, in the viewer's timezone. | Should | M4 |

## RTE: Routing forms

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| RTE-001 | A routing-form builder with text, email, phone, number, select, multi-select and radio fields. Forms are owned by a user or a team and have a public URL. | Must | M4 |
| RTE-002 | Ordered routing rules with AND/OR conditions on answers (equals, contains, in, range). The first matching rule routes to an event type, an external URL or a custom message. | Must | M4 |
| RTE-003 | A mandatory fallback route applies when no rule matches. | Must | M4 |
| RTE-004 | Routing-form answers prefill matching booking questions on the target event type and are stored on the resulting booking. | Must | M4 |
| RTE-005 | Every submission is stored with a routing trace (rules evaluated, rule matched, target). Admins can view submissions and export them as CSV. | Should | M4 |
| RTE-006 | Routing forms can be embedded (EMB-001/002). Headless routing accepts answers as URL parameters and redirects immediately. | Could | M4 |

## PAY: Payments

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| PAY-001 | Stripe integration using the instance's Stripe keys from runtime config. Users or teams connect their own Stripe account through Stripe Connect. | Must | M5 |
| PAY-002 | An event type can require payment of a fixed price in a selected currency. | Must | M5 |
| PAY-003 | Paid bookings are created as `AWAITING_PAYMENT` and hold the slot. Once payment is confirmed by a verified webhook, the booking is confirmed. Unpaid holds are released after 15 minutes (configurable). | Must | M5 |
| PAY-004 | A cancellation policy defines full, partial or no refund per notice period. Refunds are issued automatically on eligible cancellations. | Should | M5 |
| PAY-005 | Payment status appears in the dashboard and in the booking webhook payloads, and triggers `PAYMENT_*` webhook events. | Must | M5 |
| PAY-006 | PayPal payments. | Could | Post-1.0 |

## API: REST API and webhooks

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| API-001 | Webhook subscriptions can be scoped to a user, an event type or a team. Triggers are booking created, requested, cancelled, rescheduled, rejected, paid, no-show updated, routing form submitted and meeting ended. A test ping is available. | Must | M3 |
| API-002 | Webhook requests are signed with HMAC-SHA256 over timestamp plus body, using a per-subscription secret, and carry signature and timestamp headers. The documentation includes a verification snippet. | Must | M3 |
| API-003 | Webhooks are delivered through the job queue with exponential-backoff retries (at least 8 attempts over 24 h). A per-subscription delivery log shows status, response code and latency, and failed deliveries can be retried manually. | Must | M3 |
| API-004 | Webhook targets that resolve to private, loopback or link-local addresses are rejected by default (SSRF protection). An admin setting can allow them. | Must | M3 |
| API-005 | Webhook payloads have a versioned, documented JSON schema. Breaking changes require a new payload version. | Must | M3 |
| API-006 | A REST API v1 under `/api/v1` with JSON, cursor pagination and a consistent error envelope. | Must | M5 |
| API-007 | Users create personal API keys with a name, optional expiry and scopes (read/write per resource). Keys are shown once and stored hashed. | Must | M5 |
| API-008 | An OpenAPI 3.1 document is generated from the route schemas and served at `/api/v1/openapi.json`, together with a rendered reference page. | Must | M5 |
| API-009 | API endpoints cover event types, schedules, slots (with reason codes on request), bookings (create/cancel/reschedule/confirm), webhooks, teams and memberships. | Must | M5 |
| API-010 | The API is rate-limited per key (default 120 req/min, configurable) and returns standard `RateLimit-*` headers. | Must | M5 |
| API-011 | Booking creation accepts an `Idempotency-Key` header, and retries within 24 h return the original result. | Should | M5 |
| API-012 | An MCP server exposes availability lookup and booking tools to AI agents, with API-key authentication. | Could | Post-1.0 |

## INS: Insights

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| INS-001 | The insights dashboard shows counts of created, completed, cancelled, rescheduled and no-show bookings for a selected date range, compared with the previous period. | Must | M5 |
| INS-002 | Insights can be filtered by event type, team and member. Team admins see team data, and members see only their own. | Must | M5 |
| INS-003 | Charts show bookings over time, most-booked event types, busiest weekdays and hours, and round-robin distribution per member. | Should | M5 |
| INS-004 | Routing-form insights show submissions per route plus fallback rate, and every insights table can be exported as CSV. | Should | M5 |

## ADM: Administration, security and operations

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| ADM-001 | A single container image runs the web app and the pg-boss worker (the role is selected by command). `docker compose up` starts the app and PostgreSQL, and applies migrations automatically at startup. | Must | M0 |
| ADM-002 | All configuration is read at runtime from environment variables and validated with a schema at startup. Invalid or missing required values abort startup with a message naming each variable. No license key is required, and no feature is gated by one. | Must | M0 |
| ADM-003 | CI runs lint, type-check, unit, integration (real PostgreSQL) and E2E tests, plus the image build, on every PR. The main branch publishes a multi-arch (amd64/arm64) image. | Must | M0 |
| ADM-004 | `/api/health/live` and `/api/health/ready` endpoints. The readiness check verifies the DB and job queue connections. | Must | M0 |
| ADM-005 | The app shell provides authenticated layout, navigation, settings pages (profile, timezone, locale, week start, time format) and light/dark theme. | Must | M0 |
| ADM-006 | Users can delete their account. This cancels future bookings (notifying attendees), revokes integrations and hard-deletes personal data within 30 days. | Must | M1 |
| ADM-007 | Public booking endpoints have anti-abuse controls: per-IP rate limits, plus an optional privacy-friendly CAPTCHA (ALTCHA or Cloudflare Turnstile, set in runtime config). | Should | M3 |
| ADM-008 | Users can export all their data (profile, event types, schedules, bookings, attendees, workflows) as a JSON archive. | Should | M5 |
| ADM-009 | An instance admin area to list, search, disable and delete users, change the signup mode, see job queue health and view integration configuration status. | Must | M6 |
| ADM-010 | An append-only audit log of security-relevant actions (sign-in, 2FA changes, role changes, API key creation, SSO config, admin actions, data export or deletion) with actor, IP and timestamp. It can be viewed by instance admins and team owners (team scope). | Must | M6 |
| ADM-011 | Branding and white-label: an instance-wide app name, logo, favicon and brand color, per-team logo and brand color, and removal of "Powered by OpenCalendar" from booking pages and emails. | Should | M6 |
| ADM-012 | An installable PWA with offline-capable dashboard shell and push notifications for new bookings. | Could | Post-1.0 |
| ADM-013 | Multi-tenant SaaS mode with isolated organizations, custom domains and per-tenant billing. | Could | Post-1.0 |
| ADM-014 | AI assistance features (for example natural-language availability setup, booking summaries), opt-in and provider-configurable. | Could | Post-1.0 |

## I18N: Internationalization

| ID | Requirement | Priority | Milestone |
|---|---|---|---|
| I18N-001 | All dates, times, weekday names and durations are formatted with `Intl` APIs using the viewer's locale, timezone and 12h/24h preference. The first day of the week follows the user setting. | Must | M1 |
| I18N-002 | All UI and email strings are externalized as ICU MessageFormat messages. CI fails when a key is missing in the default locale. | Must | M5 |
| I18N-003 | English (`en`) and Turkish (`tr`) ship at 100% coverage. The locale comes from user preference, then `Accept-Language`, then the instance default. Booking pages can be forced to a locale through a URL parameter. | Must | M5 |
| I18N-004 | Layouts use CSS logical properties so right-to-left languages can be added without layout changes. | Could | M5 |

---

## Non-functional requirements

| ID | Category | Requirement | Milestone |
|---|---|---|---|
| NFR-001 | Performance | The slot API has p95 latency under 300 ms and p99 under 800 ms for 1 host over a 30-day window with cached calendar busy times, measured on the reference footprint (NFR-012) with 100 concurrent requests. | M2 |
| NFR-002 | Performance | A round-robin or collective slot query for 10 hosts over 30 days with cached calendars has p95 latency under 800 ms. | M4 |
| NFR-003 | Performance | The booking page has LCP under 2.5 s and INP under 200 ms on a mid-range mobile device over 4G. The embed script is at most 15 KB gzipped. | M3 |
| NFR-004 | Correctness | No double booking. Overlapping non-cancelled bookings for the same host (including buffers) are rejected by a PostgreSQL exclusion constraint, not only by application checks. A concurrency test with 50 parallel requests for the same slot produces exactly one booking. | M1 |
| NFR-005 | Correctness | Slot computations are deterministic for identical inputs. The engine has property-based tests (no slot overlaps a busy interval, no slot falls outside working hours) and DST fixtures. | M1 |
| NFR-006 | Security | OWASP ASVS Level 2 controls are applied. The app uses CSRF protection on state-changing session routes, a strict CSP on app pages, secure/HttpOnly/SameSite cookies, parameterized queries only (Drizzle), and input validation with Zod at every boundary. | M0 |
| NFR-007 | Security | Secrets never appear in logs. OAuth tokens and CalDAV passwords are encrypted at rest. API keys and tokens are stored hashed. Dependency and container scanning in CI block high or critical vulnerabilities. A security policy (`SECURITY.md`) with a disclosure process is published. | M0 |
| NFR-008 | Accessibility | Booking pages, embeds and the dashboard conform to WCAG 2.2 AA: full keyboard operation of the date and slot pickers, visible focus, screen-reader labels, 4.5:1 contrast, and support for reduced motion. axe-core runs in E2E with zero serious or critical violations. | M1 |
| NFR-009 | Internationalization | All user-facing time values are stored in UTC with the IANA zone recorded where needed. No server-local time is used anywhere. The UI supports locales with different week starts and 12h/24h conventions. | M1 |
| NFR-010 | Observability | Structured JSON logs with request and job correlation IDs. An optional OpenTelemetry trace and metrics exporter. A Prometheus-compatible `/metrics` endpoint (opt-in) exposes slot latency, booking counts, job queue depth and calendar sync errors. | M2 |
| NFR-011 | Reliability | Background jobs (emails, webhooks, reminders, calendar sync) are durable in PostgreSQL, idempotent, and retried with backoff. A worker crash never loses a scheduled reminder. | M1 |
| NFR-012 | Self-host footprint | A single instance serving up to 50 active users runs on 1 vCPU and 1 GB RAM for the app container plus a separate PostgreSQL 16+. No Redis or other stateful services are required. | M1 |
| NFR-013 | Operability | Upgrades between minor versions need no manual steps. Migrations are forward-only and tested against the previous release's schema. Release notes flag breaking config changes. | M0 |
| NFR-014 | Backup and restore | Documented backup and restore procedures based on `pg_dump`/`pg_restore`. A restore drill is part of the release checklist. The encryption key backup requirement is highlighted, and restoring without the key produces a clear error. | M1 |
| NFR-015 | Privacy / GDPR | Data export (ADM-008) and deletion (ADM-006) cover all personal data. Booker data can be deleted per booking by the host. Retention for cancelled or past bookings is configurable. No third-party trackers load on booking pages by default. Telemetry is opt-in. | M5 |
| NFR-016 | Availability | Deployments with rolling restarts have zero downtime when running at least 2 app replicas. A single-replica restart finishes in under 10 s. | M2 |
| NFR-017 | Maintainability | Overall test coverage is ≥ 80% and availability engine coverage is ≥ 95%. TypeScript strict mode is enforced, and no `any` is allowed in domain code. | M0 |
| NFR-018 | Compatibility | The dashboard supports the latest 2 versions of Chrome, Firefox, Safari and Edge. Booking pages also work on iOS Safari 16+ and Android Chrome. Generated ICS files import correctly into Google, Outlook, Apple Calendar and Thunderbird. | M1 |
