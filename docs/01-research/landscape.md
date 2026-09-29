# Open-Source Scheduling Landscape

The self-hostable alternatives to Calendly and Cal.com as of 2026, where they fall short, and where OpenCalendar fits.

Last updated: 2026-09-28

Related: [Cal.com analysis](./calcom.md) · [Calendly analysis](./calendly.md) · [Feature matrix](./feature-matrix.md) · [Product vision](../02-product/vision.md) · [Roadmap](../05-roadmap/roadmap.md)

Items marked **[unverified]** were not confirmed from the project's own repository or docs during research.

---

## 1. Context

Until April 2026, Cal.com was the default answer to "open-source Calendly". On 2026-04-14 its production code went private. The public repo became **Cal.diy** (MIT), which has no teams, routing, workflows or SSO and which the maintainers call suitable only for "personal, non-production use" ([Cal.com blog](https://cal.com/blog/cal-com-goes-closed-source-why), [Cal.diy announcement](https://cal.com/blog/cal-diy-open-source-to-closed-source), [It's FOSS](https://itsfoss.com/news/cal-com-goes-proprietary/)). Commentators noted that self-hosted choices had narrowed ([Implicator](https://www.implicator.ai/cal-com-goes-private-as-self-hosted-calendly-choices-narrow-in-2026/)). See the [Cal.com analysis](./calcom.md) for the details.

## 2. Alternatives

Primary survey: [Pinggy self-hosted Calendly alternatives](https://pinggy.io/blog/self_hosted_calendly_alternatives/).

| Project | License | Stack | Scope | Gaps vs a Calendly/Cal.com replacement |
|---|---|---|---|---|
| **Cal.diy** ([repo](https://github.com/calcom/cal.diy)) | MIT | Next.js 16 + tRPC + NestJS API v2, Prisma/Postgres, Turborepo | The ex-Cal.com engine: event types, availability, booking flow, app store, API v2 | No teams, round robin, collective, routing forms, workflows, SSO or insights. "Non-production". Diverged from Cal.com production (security rewrites not public). Heavy build (12 GB heap) and build-time env baking. Maintained by former interns |
| **Easy!Appointments** | GPL-3.0 | PHP + MySQL | Service-business booking (salons, clinics): multiple providers and services, Google Calendar sync | Service/provider model, not personal meeting links. No round-robin weighting, routing forms, workflows engine, embeds SDK or modern API/webhook story **[partly unverified]** |
| **Rallly** | AGPL-3.0 | Next.js + Postgres | Doodle-style group polls | Polls only; no booking pages, availability engine or calendar-conflict scheduling |
| **Thunderbird Appointment** | MPL-2.0 | Python API + Vue UI | CalDAV-backed booking pages for individuals | Individual scheduling only; no teams, round robin, routing, payments or workflows **[partly unverified]** |
| **Tymeslot** | AGPL-3.0 | Elixir / Phoenix, single container | Personal booking pages, easy self-hosting | Small scope; no team scheduling or routing **[unverified]** |
| **Calnode** | Apache-2.0 | Go binary + SQLite | Minimal API/agent-oriented booking | Tiny UI surface; no teams, workflows or embeds **[unverified]** |
| **Crab Fit** | GPL-3.0 | Web app, no accounts (stack **[unverified]**) | Group availability heatmap ("when are we all free?") | Not a booking system; no calendars, emails or event types |
| **Nextcloud Calendar** (appointments) | AGPL-3.0 | PHP + Vue inside Nextcloud | Appointment slots booked against a Nextcloud calendar | Requires Nextcloud. Individual only; no round robin, routing, payments or embeds **[partly unverified]** |
| **Croodle** | **[unverified]** | **[unverified]** | Privacy-focused date polls | Polls only; no booking |

Other self-hosted "lookalikes" exist, but none of the ones found during research offers team scheduling.

## 3. Summary of the market gap

| Need | Calendly | Cal.com Cloud | Cal.diy | Other OSS |
|---|---|---|---|---|
| Self-hostable, production-grade | No | No (closed source since 2026-04) | "Non-production" | Yes, but small scope |
| Round robin / collective | Teams tier ($16+/seat) | Teams tier ($12/user) | No | No |
| Routing forms | Teams tier | Teams tier | No | No |
| Workflows / reminders | Standard+ | Teams tier (Free: default email only) | No | Basic reminders at most |
| CalDAV / iCloud | New iCloud blocked since 2024-08-20 | Yes | Yes | Partial (Thunderbird Appointment, Nextcloud) |
| SSO | Enterprise ($15k+/yr) | Organizations tier | No | Rare |
| Explains why a slot is unavailable | No | Troubleshooter (partial) | Partial | No |

**The gap:** no project is both **fully open source** and **production-grade for teams**. Teams that need round robin, collective scheduling, routing forms and workflows must choose between per-seat SaaS (with an Enterprise cliff from about $960/yr to $15k+/yr, see the [Calendly analysis](./calendly.md#15-praise-vs-complaints)) and building it themselves. The OSS projects that remain each solve one slice: polls, service appointments or single-user booking pages.

Secondary gaps that users mention repeatedly:

- **Self-hosting friction:** build-time URL baking, license keys that break login or APIs, and multi-service deployments (Postgres + Redis + two backends). See [Cal.com pain points](./calcom.md#7-pain-points).
- **Opaque availability:** "my availability disappeared" is a common support case, and no tool shows the reasoning.
- **iCloud users stranded** by Calendly's 2024 decision.

## 4. Positioning statement

> **OpenCalendar is a production-grade, fully open-source (AGPLv3) scheduling platform that puts team scheduling in the core: round robin, collective events, routing forms and workflows, with no license key and no paid tier holding back features. It self-hosts as one container plus Postgres, is configured entirely at runtime, and explains its availability: for any empty slot it can tell you exactly why.**

For whom:

- **Self-hosters and privacy-conscious orgs** who need data residency and cannot, or will not, send calendars to a US SaaS.
- **Small and mid-size teams** (sales, support, recruiting, agencies) priced out by per-seat plans that gate round robin and routing.
- **Former Cal.com self-hosters** left without a production path after April 2026.
- **Developers** who want a stable REST API, signed webhooks and embeds they can build on.

Pillars:

1. **Teams in the open core.** Collective, round robin (weights and priority), managed event types, routing forms and workflows are AGPL features, not upsells.
2. **One-container self-hosting.** A single image, runtime configuration, Postgres as the only required dependency, and upgrades by pulling a new tag.
3. **Explainable availability.** A pure, tested availability engine that records the reason each candidate slot was removed.
4. **Standards first.** CalDAV (iCloud, Fastmail, Nextcloud) is first-class alongside the Google and Microsoft 365 adapters; ICS in every email.
5. **Typed and stable.** A typed schema instead of JSON blobs, and a stable versioned API with OpenAPI.

Non-goals are recorded in the [feature matrix](./feature-matrix.md) ("Out of scope"). The full product narrative is in the [product vision](../02-product/vision.md), and sequencing is in the [roadmap](../05-roadmap/roadmap.md).
