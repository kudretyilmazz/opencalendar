# Cal.com Analysis

What Cal.com offers, how it is built, why it went closed source in 2026, and what OpenCalendar should learn from it.

Last updated: 2026-09-28

Related: [Calendly analysis](./calendly.md) · [OSS landscape](./landscape.md) · [Feature matrix](./feature-matrix.md) · [Product vision](../02-product/vision.md) · [Roadmap](../05-roadmap/roadmap.md)

---

## 1. Status change (April 2026)

| Date / fact | Detail | Source |
|---|---|---|
| 2026-04-14 | Cal.com moved its production code to a private repository. The stated reason was AI-accelerated vulnerability discovery ("giving attackers the blueprints to the vault"). In January 2026 an AI scanner had found 3 chained access-control bugs in Cal.com Cloud. | [Cal.com blog](https://cal.com/blog/cal-com-goes-closed-source-why), [AlphaSignal](https://alphasignalai.substack.com/p/calcom-closed-its-source-code-heres) |
| Public repo | Renamed to `calcom/cal.diy` and relicensed from AGPLv3 to **MIT**. It has "significantly diverged" from production, which got auth and data-handling rewrites. | [Cal.diy announcement](https://cal.com/blog/cal-diy-open-source-to-closed-source) |
| Removed from Cal.diy | Teams, Organizations, multi-tenant management, Routing Forms, the Workflows engine, instant booking, AI phone agents, Attributes/Segments, SAML/SSO, Insights, API v1, impersonation, booking audit logs | [calcom/cal.diy](https://github.com/calcom/cal.diy) |
| Kept in Cal.diy | Core scheduling engine, app store, booking flows, API v2 | same |
| Positioning | The README says it is "strictly recommended for personal, non-production use". About 48.7k stars, 15.2k forks and 1,444 open issues; maintained by former interns. | same |
| Market reaction | Commentators see a gap. The usual suggestions (Easy!Appointments, Nextcloud Calendar, Rallly, Croodle) lack team features. | [Implicator](https://www.implicator.ai/cal-com-goes-private-as-self-hosted-calendly-choices-narrow-in-2026/) |

**Takeaway:** as of September 2026 there is no production-grade, open-source scheduler with team scheduling. That gap is OpenCalendar's reason to exist (see [landscape](./landscape.md)).

---

## 2. Feature inventory

Sources: [Cal.com help llms.txt](https://cal.com/help/llms.txt), [Cal.com docs llms.txt](https://cal.com/docs/llms.txt).

### 2.1 Event types

| Area | Capabilities |
|---|---|
| Basics | Title, slug, description, length; multiple selectable durations; custom slot interval; "optimized slots" |
| Buffers | Before/after buffers. Since v6.8 they count as busy everywhere ([docs](https://cal.com/help/event-types/event-buffer.md)) |
| Notice & horizon | Minimum notice. Future booking limit can be a rolling window, a fixed date range, or N business days |
| Limits | Frequency per day/week/month/year; total booked duration per period; per-user limits across event types; "active booking limit" per booker |
| Recurring | Weekly/monthly, N occurrences |
| Seats | Multiple attendees per slot; attendees can optionally be hidden from each other |
| Booking questions | Form builder with text, textarea, number, select, multiselect, checkbox, radio, phone, email, address, URL and boolean fields; hidden/required; email-domain allow/block; split name; prefill via URL params; routing answers mapped to fields |
| Privacy | Hidden (secret) event types; private single-use/expiring links (`HashedLink`) |
| Confirmation | Requires confirmation (optionally only when the booking is less than N minutes away); host accepts or rejects |
| Payments | Stripe, PayPal, Alby, BTCPay, HitPay, Cal Pay; no-show fee |
| Locations | Cal Video (Daily.co), Zoom, Google Meet, Teams, in person, phone, link, 20+ video apps |
| Misc | Event name template, redirect after booking with params, custom reply-to, option to disable confirmation emails, lock booker timezone, hide organizer email, hide notes in calendar, disable cancel/reschedule, allow rescheduling past events, restriction schedule, per-event conflict calendars |

### 2.2 Team scheduling

| Type | Behavior |
|---|---|
| `COLLECTIVE` | A slot is offered only when all hosts are free |
| `ROUND_ROBIN` | Fixed and rotating hosts, priority, weights, host groups, reset intervals, attribute-based virtual queues |
| `MANAGED` | An admin template is pushed to members, with locked fields |
| Dynamic group links | `cal.com/alice+bob` builds an ad-hoc collective booking |
| Instant meetings | Organizations tier only |

### 2.3 Availability

- Multiple named schedules, each with its own timezone, and multiple ranges per day.
- Date overrides.
- Out of office entries (reason, dates, public note, redirect to another user).
- Holidays by country and travel schedules (temporary timezone).
- Team availability view and an availability troubleshooter.

### 2.4 Booking flow and embeds

- Booker layouts: month, week and column. Timezone switcher and 12/24h toggle.
- Confirmation page and emails with ICS. Cancel/reschedule links use the booking uid. Hosts can reschedule even into busy time. No-show marking (automatic with Cal Video). UTM tracking. Slots are reserved while the booker fills the form (`SelectedSlots`).
- Embeds (`@calcom/embed-core`, `embed-react`, `embed-snippet`): inline, popup on click, floating button. Also `Cal("ui", …)` config, CSS variables, prefill, preload, parent events such as `bookingSuccessful`, and query-param forwarding ([embed docs](https://cal.com/help/embedding/embed-instructions.md)).
- Anti-abuse: blocklist/watchlist, bot detection, booking reports, account lockout.

### 2.5 Workflows ([overview](https://cal.com/help/workflows/workflowsoverview.md))

| Part | Options |
|---|---|
| Triggers | Before event, after event, booking created/cancelled/rescheduled, routing form submitted (with or without booking), payment initiated/paid, booking requested/rejected, no-show updated |
| Actions | Email to host, attendees or a specific address; SMS; WhatsApp (fixed templates); Cal.ai voice calls. SMS, WhatsApp and AI actions consume credits |
| Templates | 23+ variables (`{EVENT_NAME}`, `{CANCEL_URL}`, `{MEETING_URL}`, …); auto-translate on Orgs |
| Gating | The Free plan gets only the default reminder email |

### 2.6 Routing forms ([overview](https://cal.com/help/routing/routing-overview.md))

- Form builder, then query-builder rules, then an action: event type, external URL or custom message.
- Attribute routing (users tagged by Country, Language, etc. to filter round robin), weights, virtual queues, routing trace.
- Headless routing via URL params; CRM-owner routing (Salesforce, HubSpot).

### 2.7 Teams, orgs, insights, admin

- Memberships: `MEMBER` / `ADMIN` / `OWNER` plus custom roles.
- Organizations: sub-teams, subdomain, verified domains, custom SMTP, attributes, Directory Sync. Delegation credentials (domain-wide Google Workspace / M365). Audit logs, impersonation.
- Insights: created/completed/cancelled/no-show counts, trends, most and least booked members, popular events, routing insights. Built on denormalized views.
- White-label: remove branding (Teams), brand colors, dark mode, subdomain (Orgs), custom SMTP.
- i18n: `next-i18next` with 44 locales; event-type auto-translation.
- Admin: instance admin, DB-backed feature flags, lockout, impersonation. SSO: SAML/OIDC, SCIM (Orgs).
- Platform/Atoms (`@calcom/atoms`: Booker, EventType, AvailabilitySettings…) is in maintenance mode, and the Platform plan is closed to new signups ([atoms docs](https://cal.com/docs/atoms/introduction.md)).
- Newer products: Cal.ai phone agents, MCP server, Cal Events (ticketed), mobile and browser apps.

### 2.8 Webhooks and API

- **Webhooks** ([guide](https://cal.com/docs/developing/guides/automation/webhooks.md)): 20+ triggers (booking created/cancelled/rescheduled/requested/rejected/paid/payment initiated, meeting started/ended, recording ready, form submitted, no-show, instant meeting, OOO created). Payloads are signed with HMAC-SHA256 in `x-cal-signature-256`. Custom payload templates use `{{var}}`, and versions are set with `x-cal-webhook-version`. Webhooks can be scoped to a user, team, event type or OAuth client. Meeting started/ended events are scheduled ahead and cancelled automatically when needed. The hosted service blocks HTTP and private IPs (SSRF protection).
- **API v2** ([docs](https://cal.com/docs)): a NestJS REST API covering event types, bookings, schedules, slots, calendars, webhooks, teams and org memberships. Endpoints are date-versioned (for example slots `2024-04-15` and `2024-09-04`). Auth is by API key or OAuth; the default limit is 120 req/min. Slots accept `rescheduleUid`. API v1 is legacy and has been dropped.

### 2.9 App store (~130 apps in `packages/app-store`)

| Category | Apps |
|---|---|
| Calendars | Google, Office365, Apple, CalDAV, Exchange 2013/2016, Zoho, Lark, ICS feed |
| Video | Daily, Zoom, Meet, Teams, Webex, Jitsi, Whereby, Nextcloud Talk |
| Payments | Stripe, PayPal, Alby, BTCPay, HitPay |
| CRM | Salesforce, HubSpot, Pipedrive, Zoho, Close, Attio |
| Automation | Zapier, Make, n8n, Pipedream |
| Analytics | GA4, GTM, PostHog, Plausible, Umami, Matomo, Meta Pixel |
| AI voice | Retell, ElevenLabs, Synthflow |

---

## 3. Architecture

Verified in `calcom/cal.diy`.

| Layer | Technology |
|---|---|
| Monorepo | Yarn 4.12 workspaces + Turborepo 2.7 |
| Web app | `apps/web`: Next.js 16.2 (Pages and App Router mixed), React 18.2, next-auth 4, tRPC, Tailwind; UI packages `coss-ui`, `ui` |
| Data | Prisma + PostgreSQL 13+; `packages/kysely` for raw typed queries |
| API v2 | `apps/api/v2`: NestJS 10, Swagger, Bull, ioredis, Redis throttling; `apps/api/index.js` proxy |
| Jobs | `packages/features/tasker` + Trigger.dev + cron endpoints |
| Packages | app-store (+cli), features, trpc, prisma, lib, emails, sms, embeds, i18n, platform, dayjs, testing |
| DI | Container in `packages/features` (`AvailableSlotsService`, `UserAvailabilityService`, `BusyTimesService`) |

### 3.1 App-store pattern

Each integration is a folder under `packages/app-store/<app>/` with:

- `config.json` for metadata (name, category, logo, slug).
- `api/add.ts` for the install/OAuth callback.
- `lib/` implementing one interface: `CalendarService`, `VideoApiAdapter`, `PaymentService` or `CrmService`.
- `components/`, `static/icon.svg`, `zod.ts` (app settings schema), `.env.example`.

A CLI generates the registries (`apps.server.generated.ts`, `calendar.services.generated.ts`, `video.adapters.generated.ts`, `payment.services.generated.ts`, `crm.apps.generated.ts`). The core talks to apps only through the interfaces, and `Credential.key` is stored encrypted. See [build-an-app guide](https://cal.com/docs/developing/guides/appstore-and-integration/build-an-app.md).

**Assessment:** the interface-per-category idea is sound and worth copying. The codegen and the 130-app sprawl are not.

---

## 4. Core data model

About 95 Prisma models. The core ones:

| Model | Key fields / relations |
|---|---|
| `User` | username, email, timeZone, weekStart, defaultScheduleId, identityProvider, 2FA; credentials, eventTypes, schedules, selectedCalendars, destinationCalendar |
| `Profile` | user ↔ organization link |
| `Team` | isOrganization, parentId, slug, branding |
| `Membership` | teamId, userId, role, accepted, customRole |
| `EventType` | length, slug, schedulingType, periodType/periodDays, minimumBookingNotice, before/after buffers, slotInterval, seatsPerTimeSlot, requiresConfirmation, recurringEvent (JSON), bookingFields (JSON), locations (JSON), bookingLimits/durationLimits (JSON), metadata (JSON), scheduleId, restrictionScheduleId, parentId |
| `Host` | userId, eventTypeId, isFixed, priority, weight, scheduleId, groupId → `HostGroup` |
| `Schedule` → `Availability` | Schedule(name, timeZone, userId); Availability(days[], startTime, endTime, date — a set `date` makes it an override) |
| `Booking` | uid, status (`ACCEPTED`/`PENDING`/`CANCELLED`/`REJECTED`/`AWAITING_HOST`), start/end, recurringEventId, fromReschedule, paid, responses (JSON), metadata |
| `Attendee`, `BookingSeat`, `BookingReference` | BookingReference stores external ids per credential |
| `Credential`, `DelegationCredential` | Encrypted integration credentials |
| `SelectedCalendar` / `DestinationCalendar` | Conflict-check calendars (with webhook channel + sync tokens) and write target |
| `CalendarCache` / `CalendarCacheEvent` | Cached busy times |
| Others | Webhook, WebhookScheduledTriggers, Workflow*, WorkflowReminder, Payment, OutOfOfficeEntry, TravelSchedule, HashedLink, SelectedSlots, ApiKey, OAuthClient, Attribute*, Role/RolePermission, BookingAudit, Watchlist |

**Observation:** a lot of important configuration (locations, booking fields, limits, metadata) lives in untyped JSON columns, which makes queries and migrations fragile.

---

## 5. Slot calculation algorithm

Code: `packages/trpc/server/routers/viewer/slots/util.ts` (`AvailableSlotsService`), `packages/features/availability/lib/getUserAvailability.ts`, `packages/features/busyTimes/services/getBusyTimes.ts`, `getAggregatedAvailability/`, `packages/features/schedules/lib/{date-ranges,slots}.ts`.

1. **Load the event type and hosts.** A dynamic group link builds a temporary event type. Round-robin hosts are filtered by routing and attributes.
2. **Compute the window.** `start = max(requested start, now + minimum notice)`; `end` is capped by `periodType` (rolling days, rolling window, fixed range).
3. **Working hours per host.** The schedule is resolved in this order: Host → event type → user default. Weekly `Availability` rows are expanded in the schedule's timezone, then travel schedules are applied. Date overrides replace whole days, and OOO and holidays are removed. The result is a list of UTC ranges.
4. **Busy times.**
   - ACCEPTED bookings padded by buffers (a seated slot that still has seats counts as busy only for the buffer).
   - `SelectedCalendar` busy times via `CalendarService.getAvailability`, using the cache plus push updates.
   - Periods where a limit is reached become busy (per user or team).
   - Reserved `SelectedSlots`.
   - The booking named by `rescheduleUid` is excluded.
   - Everything is normalized to UTC ([PR #30025](https://github.com/calcom/cal.diy/pull/30025)).
5. **Free = working − busy.**
6. **Aggregate across hosts.** Fixed/collective hosts are intersected. Round-robin hosts are unioned within their host group, then groups are intersected with each other and with the fixed hosts.
7. **Intersect with the restriction schedule**, if one is set.
8. **Generate slots** (`buildSlotsWithDateRanges`): step by `slotInterval` or length, align start times to round boundaries, and require the full length to fit. Slots before `now + notice` are dropped, and seats remaining are attached.
9. **Choose the host at booking time.** The round-robin host is chosen separately (fewest bookings, weighted or by priority). `isAvailable` is re-checked before the write to avoid races.

Results are cached (`withSlotsCache`). Both the tRPC `viewer.slots.getSchedule` and API v2 `/slots` use this pipeline.

**Assessment:** the set algebra (intersect, union, subtract over UTC ranges) is correct and worth reproducing. It is spread across tRPC, features and DI services, though, and nothing tells the user *why* a slot is missing. OpenCalendar should implement it as a pure, well-tested library that returns reasons (see [feature matrix differentiators](./feature-matrix.md#differentiators)).

---

## 6. License and pricing

### 6.1 License history

| Period | Model | Source |
|---|---|---|
| Before 2026-04 | AGPLv3 core + commercial EE (`packages/features/ee`, parts of the API). "Singleplayer open, multiplayer paid". Self-hosted EE needed `CALCOM_LICENSE_KEY`. | [AGPL + EE post](https://cal.com/blog/changing-to-agplv3-and-introducing-enterprise-edition), [issue #15370](https://github.com/calcom/cal.com/issues/15370) |
| Since 2026-04 | Production is closed source. Cal.diy is MIT and has no EE. | [Cal.diy announcement](https://cal.com/blog/cal-diy-open-source-to-closed-source) |

### 6.2 Pricing ([cal.com/pricing](https://cal.com/pricing))

| Plan | Price | Notable inclusions |
|---|---|---|
| Free | $0, 1 user | Unlimited event types and calendars, 100+ apps, Stripe/PayPal, Salesforce/HubSpot sync, default email reminder |
| Teams | $12/user/mo (annual) | Round robin, collective, managed, recurring, workflows, routing, remove branding, insights, APIs |
| Organizations | $28/user/mo | Sub-teams, subdomain, attribute routing, SAML, SCIM, instant meetings, delegation, RBAC, SOC2/HIPAA/ISO |
| Enterprise | Custom | — |

SMS, WhatsApp and AI credits cost extra.

---

## 7. Pain points

1. **No open-source team option anymore.** Cal.diy lacks teams, round robin, routing, workflows and SSO, and calls itself "non-production".
2. **Self-hosting is hard.**
   - `NEXT_PUBLIC_WEBAPP_URL` and similar values are baked in at build time, so changing the domain means a rebuild ([discussion #3704](https://github.com/calcom/cal.com/discussions/3704)).
   - Docker support was community-maintained, and upgrades broke installs ([HN](https://news.ycombinator.com/item?id=34508935)).
   - An install needs many secrets plus Postgres, and Redis for API v2.
3. **License-key friction.** Without a key, API v2 returned 500s or would not start, login broke, and trials expired ([#24856](https://github.com/calcom/cal.com/issues/24856), [#24733](https://github.com/calcom/cal.com/issues/24733), [cal.diy #23342](https://github.com/calcom/cal.diy/issues/23342), [Cloudron forum](https://forum.cloudron.io/topic/14836/no-access-to-apiv2-due-to-missing-licence-key)).
4. **Heavy and complex.** About 95 models, about 130 apps, two backends (Next + tRPC and NestJS), codegen registries, 50+ CI workflows and a 12 GB node heap for builds. Self-hosters are also exposed to Next.js security issues ([#25852](https://github.com/calcom/cal.diy/issues/25852)).
5. **Performance.** v6.4 admitted 20s+ page loads for large orgs before a 20x fix ([v6.4 post](https://cal.com/blog/calcom-v6-4)). Slot calculation queries every calendar unless the cache is warm.
6. **Untyped JSON settings.** Locations, bookingFields, limits and metadata live in JSON columns, which makes queries and migrations fragile.
7. **Opaque availability.** "My availability disappeared" is a recurring support topic ([display issues](https://cal.com/help/event-types/display-issues.md)). Nothing explains why a slot is missing.
8. **Unstable developer surface.** Atoms is in maintenance mode, the Platform plan is closed, API v1 was dropped, and v2 is date-versioned.
9. **Paywalls on basics.** Workflows, routing and even branding removal are paid, and messaging credits cost extra.

---

## 8. Lessons for OpenCalendar

### Take

- The **availability pipeline** as set algebra over UTC ranges: working hours − busy, then intersect for collective and union for round robin, then slot generation.
- The **interface-per-category integration pattern** (`CalendarService`, `VideoAdapter`, `PaymentService`) with encrypted credentials.
- The **three team scheduling types** (collective, round robin with weights/priority, managed) and dynamic group links.
- **Reserving a slot while the booker fills the form**, and re-checking availability before the write.
- **Webhook design**: HMAC-SHA256 signatures, per-scope subscriptions, SSRF protection, versioned payloads.
- **Embed modes** (inline, popup, floating button) with prefill and postMessage events.
- The **conflict calendars vs destination calendar** split.

### Avoid

- Open core with a license key. No EE folder and no key checks: teams, round robin, routing and workflows ship in the AGPL core.
- Build-time configuration. All URLs, secrets and feature toggles are read at runtime, so one image fits every domain.
- Two backends and codegen registries. Use one Next.js app with one API layer and explicit, hand-written adapter registration.
- JSON columns for core settings. Use typed columns or tables, and keep JSON only for truly free-form metadata.
- App-store sprawl. Ship a small set of first-party adapters that are maintained well.
- Date-versioned API churn. Ship a stable `/api/v1` with OpenAPI and additive changes.

### Improve

- **Explainable availability:** for any date, show which rule removed each candidate slot (outside hours, busy on calendar X, buffer, limit reached, notice, OOO).
- **One-container self-hosting:** app plus Postgres, with no Redis requirement at small scale and background jobs running in-process or in Postgres.
- **CalDAV-first** calendar support (iCloud, Fastmail, Nextcloud), with Google and Microsoft as adapters.
- **Performance by design:** a busy-time cache with sync tokens and an explicit cache-status indicator.

Milestone mapping for each of these is in the [feature matrix](./feature-matrix.md) and the [roadmap](../05-roadmap/roadmap.md).
