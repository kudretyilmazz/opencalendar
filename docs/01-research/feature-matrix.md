# Feature Matrix

Feature-by-feature comparison of Cal.com Cloud, Cal.diy, Calendly and the OpenCalendar milestone that targets each feature.

Last updated: 2026-09-28

Related: [Cal.com analysis](./calcom.md) · [Calendly analysis](./calendly.md) · [OSS landscape](./landscape.md) · [Product vision](../02-product/vision.md) · [Roadmap](../05-roadmap/roadmap.md)

---

## Legend

**Competitor columns**

- `Yes`: available on all plans, or in the OSS build.
- `No`: not available.
- A plan name (`Free`, `Standard`, `Teams`, `Orgs`, `Enterprise`, …): the lowest plan that includes the feature.
  - Cal.com plans are Free / Teams / Orgs / Enterprise ([pricing](https://cal.com/pricing)).
  - Calendly plans are Free / Standard / Teams / Enterprise ([pricing](https://calendly.com/pricing)).
- `Partial`: a limited form of the feature.
- `?`: unknown or **[unverified]**.

**OpenCalendar target**

| Value | Meaning |
|---|---|
| `M1` | Core scheduling for a single user |
| `M2` | Calendars and video |
| `M3` | Booking power features |
| `M4` | Teams |
| `M5` | Platform (API, payments, insights, i18n) |
| `M6` | Enterprise-lite |
| `Post-1.0` | Planned after the 1.0 release |
| `Out of scope` | Not planned |

M0 (Foundation: DB, auth, app shell, CI) is infrastructure only and has no user-facing rows. Sequencing is in the [roadmap](../05-roadmap/roadmap.md).

---

## Matrix

### Event types

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| One-on-one event types | Yes | Yes | Free (1) / Standard (unlimited) | M1 |
| Duration, title, slug, description | Yes | Yes | Yes | M1 |
| Multiple selectable durations | Yes | Yes | ? | M1 |
| Before/after buffers | Yes | Yes | Yes | M1 |
| Minimum notice | Yes | Yes | Yes | M1 |
| Booking horizon (rolling / fixed range) | Yes | Yes | Yes | M1 |
| Slot interval / start time increments | Yes | Yes | Yes | M1 |
| Custom booking questions | Yes | Yes | Yes | M3 |
| Frequency limits (per day/week/month) | Yes | Yes | Yes | M3 |
| Duration limits (total booked time per period) | Yes | Yes | No | M3 |
| Requires confirmation | Yes | Yes | ? | M3 |
| Seats / group events | Yes | Yes | Standard | M3 |
| Recurring events | Teams | Yes | No | M3 |
| Hidden / secret event types | Yes | Yes | Yes | M3 |
| Single-use / expiring private links | Yes | Yes | Yes (one-off) | M3 |
| One-off meetings (custom times) | ? | ? | Yes | M5 |
| Meeting polls | No | No | Yes | M5 |
| Event name template, lock timezone, hide organizer email | Yes | Yes | Partial | Post-1.0 |
| Ticketed events (Cal Events) | Yes | No | No | Out of scope |

### Availability

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Multiple named schedules with timezone | Yes | Yes | Yes | M1 |
| Multiple ranges per day | Yes | Yes | Yes | M1 |
| Date overrides | Yes | Yes | Yes | M1 |
| Availability engine (working − busy, slot generation) | Yes | Yes | Yes | M1 |
| Out of office with redirect to another user | Yes | Yes | ? | M5 |
| Holidays by country | Yes | Yes | ? | M5 |
| Travel schedules (temporary timezone) | Yes | Yes | No | M5 |
| Restriction schedule per event type | Yes | Yes | No | Post-1.0 |
| Team availability view | Teams | No | ? | M4 |
| Availability troubleshooter / "why is this slot unavailable" | Partial | Partial | No | M1 |

### Booking

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Public booking page with timezone detection | Yes | Yes | Yes | M1 |
| Profile landing page listing event types | Yes | Yes | Yes | M1 |
| Month / week / column layouts | Yes | Yes | Month | M1 (month); Post-1.0 (others) |
| Confirmation page | Yes | Yes | Yes | M1 |
| Cancel / reschedule links (no account) | Yes | Yes | Yes | M1 |
| Slot reservation during form fill | Yes | Yes | ? | M1 |
| Host dashboard of bookings | Yes | Yes | Yes | M1 |
| Redirect after booking with params | Yes | Yes | Yes | M3 |
| No-show marking | Yes | Yes | ? | M3 |
| Guests / additional attendees | Yes | Yes | Yes | M3 |
| Prefill via URL params | Yes | Yes | Yes | M3 |
| Anti-abuse (blocklist, bot detection) | Yes | Partial | ? | Post-1.0 |
| Instant meetings | Orgs | No | No | Post-1.0 |

### Calendars

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Google Calendar | Yes | Yes | Yes | M2 |
| Microsoft 365 / Outlook.com | Yes | Yes | Yes | M2 |
| CalDAV (Fastmail, Nextcloud, generic) | Yes | Yes | No | M2 |
| iCloud (CalDAV) | Yes | Yes | No new connections since 2024-08-20 | M2 |
| ICS feed (read-only busy source) | Yes | Yes | No | M2 |
| Multiple conflict calendars | Yes | Yes | Free 1 / paid 6 | M2 |
| Destination (write) calendar | Yes | Yes | Yes | M2 |
| Exchange on-prem 2013/2016 | Yes | Yes | Yes (Exchange) | Out of scope |
| Zoho, Lark calendars | Yes | Yes | No | Post-1.0 |
| Domain-wide delegation credentials | Orgs | No | ? | Post-1.0 |

### Conferencing and locations

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Google Meet | Yes | Yes | Yes | M2 |
| Microsoft Teams | Yes | Yes | Yes | M2 |
| Zoom | Yes | Yes | Yes | M2 |
| Jitsi / custom link | Yes | Yes | Custom | M2 |
| In-person / phone | Yes | Yes | Yes | M2 |
| Built-in video (Cal Video / Daily) | Yes | Yes | No | Post-1.0 |
| Webex, Whereby, GoTo, Nextcloud Talk | Yes | Yes | Webex, GoTo | Post-1.0 |

### Notifications and workflows

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Confirmation emails with ICS | Yes | Yes | Yes | M1 |
| Cancel / reschedule emails | Yes | Yes | Yes | M1 |
| Email workflows / reminders (trigger + action) | Teams (Free: default reminder) | No | Standard | M3 |
| Template variables | Teams | No | Standard | M3 |
| SMS reminders (Twilio) | Teams + credits | No | Standard | M6 |
| WhatsApp | Teams + credits | No | No | Out of scope |
| AI voice phone agents | Yes (credits) | No | No | Out of scope |
| Managed / locked workflows | Orgs | No | Teams | M4 |

### Teams

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Teams and memberships | Teams | No | Teams | M4 |
| Roles (member / admin / owner) | Teams | No | Teams | M4 |
| Custom roles / RBAC | Orgs | No | Enterprise | Post-1.0 |
| Collective events | Teams | No | Teams | M4 |
| Round robin | Teams | No | Teams | M4 |
| Round robin weights / priority | Teams | No | Partial | M4 |
| Managed event types | Teams | No | Teams | M4 |
| Dynamic group links (`alice+bob`) | Yes | Partial | No | M4 |
| Organizations with sub-teams and subdomains | Orgs | No | Enterprise | Post-1.0 |

### Routing

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Native routing forms | Teams | No | Teams | M4 |
| Route to event type / URL / message | Teams | No | Teams | M4 |
| Attribute-based routing / virtual queues | Orgs | No | No | Post-1.0 |
| CRM-owner routing (Salesforce, HubSpot) | Teams | No | Enterprise (SF lookup) | Post-1.0 |
| Routing on third-party forms (HubSpot, Marketo, Pardot) | No | No | Teams | Post-1.0 |

### Payments

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Stripe paid events | Yes | Yes | Standard | M5 |
| No-show fee | Yes | Yes | ? | Post-1.0 |
| PayPal | Yes | Yes | Standard | Post-1.0 |
| Crypto (Alby, BTCPay) | Yes | Yes | No | Out of scope |

### Embeds

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Inline embed | Yes | Yes | Yes | M3 |
| Popup embed | Yes | Yes | Yes | M3 |
| Floating button | Yes | Yes | Yes | M3 |
| postMessage events (booking success) | Yes | Yes | Yes | M3 |
| React embed package | Yes | Yes | ? | Post-1.0 |
| Embeddable UI components (Atoms) | Maintenance mode | Partial | No | Post-1.0 |

### API and webhooks

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Webhooks with HMAC signature | Yes | Yes | Standard | M3 |
| Webhook SSRF protection | Yes | ? | ? | M3 |
| REST API with API keys | Teams (v2) | Yes (v2) | Yes (PAT) | M5 |
| OpenAPI spec | Yes | Yes | Yes | M5 |
| OAuth apps for third parties | Yes | Yes | Yes | Post-1.0 |
| Direct booking API (no iframe) | Yes | Yes | Standard | M5 |
| MCP server / agent booking | Yes | No | Yes (hosted only) | Post-1.0 |
| Zapier / Make / n8n app | Yes | Yes | Yes | Post-1.0 |
| CRM adapters (HubSpot, Salesforce) | Yes | Yes | Standard / Teams | Post-1.0 |

### Analytics

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Insights dashboard (created / completed / cancelled / no-show) | Teams | No | Teams | M5 |
| Routing insights | Teams | No | Teams | Post-1.0 |
| CSV export | ? | No | Teams | M5 |
| Analytics apps (GA4, Plausible, PostHog…) | Yes | Yes | Partial | Post-1.0 |

### Admin and security

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Instance admin panel | Yes (self-host) | Yes | N/A | M6 |
| OIDC / SAML SSO | Orgs | No | Enterprise | M6 |
| SCIM provisioning | Orgs | No | Enterprise | Post-1.0 |
| Audit log | Orgs | No | Enterprise | M6 |
| Custom SMTP per team | Orgs | No | No | M6 |
| Impersonation | Orgs | No | ? | Post-1.0 |
| 2FA | Yes | Yes | ? | Post-1.0 |
| Data deletion API / HIPAA BAA | Enterprise | No | Enterprise | Post-1.0 |
| SaaS multi-tenant orgs / subdomains | Orgs | No | N/A | Post-1.0 |

### i18n and branding

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| UI localization | Yes (44 locales) | Yes | Partial | M5 (en, tr) |
| Event type auto-translation | Orgs | No | No | Post-1.0 |
| Brand colors / dark mode | Yes | Yes | Yes | M6 |
| Remove branding / white-label | Teams | Yes | Standard ([unverified]) / Enterprise (full) | M6 |
| Mobile app / PWA | Yes | No | Yes | Post-1.0 |

### AI

| Feature | Cal.com (cloud) | Cal.diy (OSS) | Calendly | OpenCalendar target |
|---|---|---|---|---|
| Meeting notetaker (recording, transcript, recap) | ? | No | Standard Plus | Post-1.0 |
| Email scheduling assistant (Callie-style) | No | No | Standard Plus (beta) | Post-1.0 |
| AI voice phone agents | Yes (credits) | No | No | Out of scope |
| AI-drafted emails | ? | No | Yes | Post-1.0 |

Sources for competitor values: [Cal.com analysis](./calcom.md) and [Calendly analysis](./calendly.md), which link to the primary pages. `?` cells are open research items.

---

## Differentiators

What OpenCalendar offers that neither Cal.com nor Calendly does:

1. **Explainable availability.** The engine records why each candidate slot was dropped (outside working hours, busy on a named calendar, buffer, limit reached, minimum notice, OOO). Hosts see this in a "why is this slot unavailable" view, which addresses the recurring "my availability disappeared" support case ([Cal.com display issues](https://cal.com/help/event-types/display-issues.md)).
2. **No license key, ever.** There is no EE folder and no feature flags tied to payment, so the APIs and login cannot break because a key expired ([Cal.com #24856](https://github.com/calcom/cal.com/issues/24856)).
3. **Runtime configuration.** Domain, URLs, secrets and providers are read at startup. One published image works for every install, with no rebuild to change a domain ([Cal.com discussion #3704](https://github.com/calcom/cal.com/discussions/3704)).
4. **Typed schema.** Locations, booking fields, limits and workflow steps use typed columns and tables instead of JSON blobs, which makes migrations and queries safe.
5. **Teams in the open core.** Round robin, collective, managed event types, routing forms and workflows are AGPLv3, not a $12–$16/seat upsell.
6. **CalDAV-first, including iCloud.** CalDAV (iCloud, Fastmail, Nextcloud) is a first-class M2 feature, while Calendly has blocked new iCloud connections since 2024-08-20 ([Calendly iCloud](https://calendly.com/help/icloud-overview)).

See the [product vision](../02-product/vision.md) for how these become product principles, and the [roadmap](../05-roadmap/roadmap.md) for delivery order.
