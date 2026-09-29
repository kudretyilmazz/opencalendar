# Product Vision

OpenCalendar is a production-grade, fully open-source (AGPLv3) scheduling platform that you can self-host in one command, with team features included in the core.

Last updated: 2026-09-28

Related: [Requirements](./requirements.md) · [User flows](./user-flows.md) · [Glossary](./glossary.md) · [Feature matrix](../01-research/feature-matrix.md) · [Roadmap](../05-roadmap/roadmap.md)

---

## 1. Problem

Scheduling a meeting should be simple. The open-source options for doing it have become harder to rely on.

- **Cal.com closed its source on 2026-04-14.** The production codebase moved to a private repository. The public fork, **Cal.diy** (MIT), no longer includes Teams, Organizations, Routing Forms, Workflows, SAML/SSO, Insights, API v1 or audit logs, and its README describes it as *"strictly recommended for personal, non-production use"*. Organizations that picked Cal.com because they could self-host it now have no supported open-source upgrade path.
- **Calendly is closed and prices by feature tier.** Collective and round-robin events, routing, managed event types, SSO and analytics all sit behind Teams or Enterprise plans. Data stays on Calendly's servers. New iCloud calendar connections have been blocked since 2024-08-20.
- **Other self-hosted tools cover only part of the job.** Easy!Appointments, Nextcloud Calendar, Rallly and Croodle handle a single user, appointment booking or polls. None of them does team scheduling with round robin, routing and workflows.
- **Nobody explains availability.** When a slot is missing, hosts and admins can't find out why. It might be a buffer, a calendar event, minimum notice, a frequency limit or a timezone rule. In every product we reviewed, debugging availability means guessing.
- **Self-hosting is still painful.** Existing stacks need Redis, several services, build-time environment variables baked into images, or license keys to unlock features.

The market is missing a team scheduler that is open source, ready for production and easy to operate.

## 2. Positioning statement

> **For** professionals, teams and organizations that want to own their scheduling infrastructure,
> **OpenCalendar is** an open-source scheduling platform
> **that** provides everything from single-user booking pages to round-robin team routing in one AGPLv3 codebase, deployable as a single container configured at runtime,
> **unlike** Cal.com (now closed source, with a non-production open fork) and Calendly (closed, with team features behind paid tiers),
> **we** keep the whole product open, run on modest hardware without a license key, support CalDAV calendars (including iCloud) as first-class citizens, and can tell you exactly why any slot is unavailable.

We deliberately trade breadth of integrations for depth and reliability. We will ship fewer integrations than competitors, and each one we do ship will be maintained and tested.

## 3. Differentiators

| Differentiator | What it means in practice |
|---|---|
| **Whole product is open** | Teams, round robin, routing forms, workflows, SSO and insights are all in the AGPLv3 core. There is no EE folder and no license key. |
| **One-container self-hosting** | `docker compose up` starts the app, the background worker and PostgreSQL. All configuration is read at runtime from validated environment variables (ADM-001, ADM-002). |
| **Explainable availability** | For every excluded candidate slot, the availability engine returns machine-readable reason codes. Hosts see them in a debug view (AVL-005, AVL-008). |
| **CalDAV-first** | iCloud, Fastmail and Nextcloud get the same level of support as Google and Microsoft 365 (INT-004). |
| **Minimal infrastructure** | PostgreSQL is the only stateful dependency. Jobs run on pg-boss, so no Redis is needed. |

## 4. Target users and personas

### P1: Solo professional ("Selin, independent consultant")

- **Context:** Coach, consultant, therapist, tutor or freelancer. Uses iCloud or Google Calendar. Charges for some sessions.
- **Jobs to be done:** Share one link, get booked without back-and-forth email, never get double-booked, take payment up front, and send automatic reminders.
- **Pain today:** Calendly's free tier allows only one event type. Paid tiers are expensive for one person. iCloud isn't supported.
- **Success looks like:** Within 10 minutes of signing up, Selin has connected a calendar, set her hours and shared a working link.

### P2: Small team or agency ("Deniz, operations lead at a 12-person agency")

- **Context:** Sales and delivery teams that need to share inbound demand fairly.
- **Jobs to be done:** Run round-robin intro calls weighted by capacity, hold collective meetings that need two specialists, route leads from a qualification form to the right event type, and manage event types centrally.
- **Pain today:** Paying for a per-seat Teams plan just to get round robin and routing. Cal.diy has no team features.
- **Success looks like:** Round robin spreads bookings fairly, and Deniz can see why a particular person was picked.

### P3: Self-hosting organization or IT admin ("Mert, IT admin at a university / public agency / EU SME")

- **Context:** Has data residency or compliance requirements and existing identity (OIDC/SAML) and mail (SMTP) infrastructure. Often uses Nextcloud or Exchange-adjacent tooling.
- **Jobs to be done:** Deploy on internal infrastructure, integrate SSO, audit activity, back up and restore, upgrade safely, and export or delete personal data on request.
- **Pain today:** SaaS isn't acceptable. Cal.com self-hosting required EE license keys and is now closed. Its stack is heavy.
- **Success looks like:** A production deployment runs on one small VM, sends mail through the org's SMTP relay and upgrades with one command.

### P4: Developer embedding scheduling ("Ayşe, full-stack developer at a SaaS startup")

- **Context:** Wants booking inside her own product or website and needs automation around bookings.
- **Jobs to be done:** Embed a booking widget, listen to booking events in the parent page, receive signed webhooks, and create or read bookings over a documented REST API.
- **Pain today:** Cal.com's Platform/Atoms are in maintenance mode and closed to new signups. Calendly's Scheduling API costs extra.
- **Success looks like:** Ayşe goes from the embed snippet to a verified webhook in under an hour, using OpenAPI-generated clients.

## 5. Product principles

1. **The open core is the whole product.** Every feature we build ships under AGPLv3 in the main repository. We don't use feature flags tied to licenses, and there is no "enterprise edition" directory. Anyone can run a managed offering or support contract on top, but the code stays the same.
2. **Self-host in one command.** A single container image covers the web app and worker, with PostgreSQL alongside. All configuration happens at runtime (no rebuilding to change a URL or an OAuth client). The app validates configuration at startup and gives actionable errors. Migrations run automatically. The reference deployment should run on 1 vCPU and 1 GB RAM.
3. **Explainable by design.** The availability engine is a pure, deterministic function whose output includes the reasons slots were excluded. Round-robin host selection and routing-form decisions leave a trace. If a user asks "why?", the product can answer. See [availability engine](../03-architecture/availability-engine.md).
4. **Typed and tested.** We use end-to-end TypeScript, Zod schemas at every boundary, and Drizzle-typed queries. The availability engine is covered by property-based tests and DST fixtures. Critical flows (book, reschedule, cancel, round robin) have E2E tests. Correctness beats feature count.
5. **Privacy and data ownership.** Your data lives in your database. We send no telemetry unless you opt in, and there are no third-party trackers on booking pages. Integration credentials are encrypted at rest. Users can export and delete their data.
6. **Accessible to everyone.** Booking pages and the dashboard target WCAG 2.2 AA. Bookers include people using keyboards, screen readers and mobile devices on slow networks.
7. **Standards over lock-in.** We build on CalDAV, iCalendar (RFC 5545), iTIP, OIDC, SAML, OpenAPI and HMAC-signed webhooks, so integrations work with existing ecosystems instead of proprietary marketplaces.
8. **Fewer integrations, done well.** We only ship an integration when we can test it and commit to maintaining it. Generic webhooks and the REST API cover the long tail.

## 6. Success metrics

### Product quality (measured in CI and on staging)

| Metric | Target |
|---|---|
| Double bookings in production telemetry or bug reports | 0 confirmed incidents per release |
| Slot API p95 latency (1 host, 30-day window, cached calendars) | < 300 ms |
| Availability engine test coverage | ≥ 95% lines, with DST fixtures for at least 10 timezones |
| Overall test coverage | ≥ 80% |
| Booking page Lighthouse accessibility score | ≥ 95, zero axe-core critical violations |

### Adoption (first 12 months after 1.0)

| Metric | Target |
|---|---|
| Time from `git clone` / `docker compose up` to first booking | < 15 minutes (median, measured in onboarding studies) |
| Host onboarding completion (signup → shared link) | ≥ 70% of new accounts |
| GitHub stars | 5,000 |
| Known production self-hosted instances (opt-in ping or self-reported) | 500 |
| External contributors with merged PRs | 50 |
| Teams using round robin or routing on self-hosted instances | 100 (opt-in reporting) |

### Operations

| Metric | Target |
|---|---|
| Upgrade success (minor versions, no manual steps) | ≥ 99% |
| Median time to triage a security report | < 72 hours |
| Webhook delivery success (after retries) | ≥ 99.9% |

## 7. Non-goals

Leaving these out on purpose keeps the product focused.

- **Not a general-purpose calendar client.** We read busy times and write booking events. We don't replace Google Calendar, Outlook or Nextcloud Calendar for day-to-day calendar management.
- **Not a large app marketplace at 1.0.** No third-party app store and no 100+ integrations. CRM adapters, Zapier/n8n, PayPal and similar integrations come after 1.0.
- **No multi-tenant SaaS at 1.0.** The architecture shouldn't block it, but 1.0 targets single-organization instances. Tenancy isolation comes after 1.0.
- **No built-in video conferencing server.** We integrate with Google Meet, Microsoft Teams, Zoom, Jitsi or any static link. We don't run media servers.
- **No AI phone agents or AI features at 1.0.** An MCP server for agent booking and other AI features are planned for after 1.0.
- **No resource or room booking, ticketing or event management.** Bookings are meetings between people.
- **No native mobile apps.** The web app is responsive. A PWA comes after 1.0.
- **No proprietary enterprise edition, now or later.** Features won't be withheld to sell licenses.
- **No compatibility layer for Cal.com's or Calendly's APIs.** We may provide import tools, but our API is our own.

## 8. Scope by milestone (summary)

The detailed plan is in the [roadmap](../05-roadmap/roadmap.md). Requirement IDs are listed in [requirements.md](./requirements.md).

| Milestone | Theme |
|---|---|
| **M0 Foundation** | DB, auth, app shell, CI, env validation, docker compose |
| **M1 Core scheduling** | Single-user schedules, event types, availability engine, booking page, emails/ICS, dashboard |
| **M2 Calendars & video** | Google, Microsoft 365, CalDAV, ICS feeds, conferencing and locations |
| **M3 Booking power** | Questions, limits, confirmation, seats, recurring, embeds, webhooks, workflows, explainability view |
| **M4 Teams** | Teams, collective, round robin, managed event types, dynamic groups, routing forms |
| **M5 Platform** | REST API, Stripe, insights, i18n, polls, one-off meetings, OOO, holidays, travel |
| **M6 Enterprise-lite** | SSO, SMS, audit log, instance admin, branding, per-team SMTP |
| **Post-1.0** | MCP/agents, CRM, PayPal, Zapier/n8n, PWA, SaaS, SCIM, AI |
