# Calendly Analysis

Calendly's features, plan gating, developer surface, AI push and user sentiment, and what OpenCalendar should learn from it.

Last updated: 2026-09-28

Related: [Cal.com analysis](./calcom.md) · [OSS landscape](./landscape.md) · [Feature matrix](./feature-matrix.md) · [Product vision](../02-product/vision.md) · [Roadmap](../05-roadmap/roadmap.md)

Items marked **[unverified]** could not be confirmed on a primary Calendly page.

---

## 1. Event types

Sources: [event types overview](https://calendly.com/help/event-types-overview), [multi-person options](https://calendly.com/help/multi-person-scheduling-options-for-your-organization), [group events](https://calendly.com/help/group-event-type-overview), [workflows blog](https://calendly.com/blog/workflows).

| Type | Behavior | Plan |
|---|---|---|
| One-on-one | 1 host, 1 invitee | Free (1 event type) / Standard+ unlimited |
| Group | 1 host, many invitees in the same slot, with a seat cap | Standard+ |
| Collective | Multiple hosts; only times when all are free | Teams+ |
| Round robin | Rotates among members; optimizes for equal distribution or for availability | Teams+ |
| Meeting Polls | Invitees vote on times (up to 40, no account needed); books automatically | All |
| One-off meeting | Single-use link with custom times | All |
| Managed events / Managed Workflows | Admins define and lock event types and reminders | Teams / Enterprise |

## 2. Event type settings

Source: [customize event types](https://calendly.com/help/how-to-customize-your-event-types).

| Group | Settings |
|---|---|
| Basics | Name, color, duration, location (Zoom, Meet, Teams, phone, in person, custom), hosts |
| Availability | Date range (rolling N days, fixed range or indefinite), minimum notice, hours from a named schedule, date overrides |
| Limits & buffers | Before/after buffers; per-event-type caps per day/week/month; caps across all event types ([meeting limits](https://calendly.com/help/how-to-set-meeting-limits)) |
| Start time increments | 15/30 min, etc. ([fine-tune availability](https://calendly.com/help/how-to-fine-tune-your-availability-settings)) |
| Calendar overlap | The host can allow bookings over events on connected calendars |
| Booking page | Custom slug; timezone display (locked, or detected from the invitee) |
| Invitee form | Name and email always; custom questions (short text, long text, radio, checkbox, dropdown, phone); allow guests |
| Payment | Stripe, PayPal (Venmo and cards since July 2026, [release notes](https://calendly.com/release-notes)) |
| Confirmation | Calendly page with custom links, or redirect to an external URL with booking params |
| Other | Event language, permissions, secret events (hidden from the landing page, reachable only by direct link) |

## 3. Availability and calendars

Sources: [iCloud overview](https://calendly.com/help/icloud-overview), [free/busy guide](https://community.calendly.com/asked-answered-79/calendly-calendar-availability-and-free-busy-status-guide-4885).

- Supported: Google, Outlook/O365 and Exchange. Free allows 1 calendar; paid plans allow up to 6.
- The user picks which calendars are checked for conflicts, and Busy blocks remove slots. Outlook "Busy", "Working Elsewhere" and "Away" count as unavailable by default (configurable). Bookings are written to a single calendar.
- **New iCloud connections have been blocked since 2024-08-20.** Users complain about this often, and it is an opening for a CalDAV-first product.

## 4. Booking flow, reschedule, cancel

1. The landing page lists all event types.
2. The invitee picks a day on a month calendar.
3. The invitee picks a time slot in their auto-detected timezone (changeable).
4. The invitee fills in the form.
5. The invitee pays, if the event is paid.
6. A confirmation page or a redirect follows.

- Emails include an `.ics` file and reschedule/cancel links. The invitee needs no account.
- The host can show cancellation policy text and can request a reschedule or cancel from the dashboard. **[details unverified]**

## 5. Workflows

Sources: [SMS automations](https://calendly.com/help/how-to-send-text-messages-with-automations), [workflows blog](https://calendly.com/blog/workflows), [learn: workflows](https://calendly.com/learn/calendly-workflows).

- Model: a **trigger** (booked, before start, after end, canceled…) plus an **action** (email or SMS to the host or invitee), with template variables.
- SMS goes through Twilio, using the phone number collected at booking.
- Managed Workflows are Teams/Enterprise. Workflows in general need Standard+.

## 6. Routing

- Native routing forms, or routing on top of HubSpot, Marketo or Pardot forms. A route leads to an event type, a member or a URL.
- Salesforce lookup routing (Enterprise).
- Routing analytics for Teams admins.
- A `routing_form_submission.created` webhook (organization scope only).

## 7. Payments

- Stripe and PayPal (Venmo and cards added July 2026), configured per event type. Standard+ ([pricing](https://calendly.com/pricing)).

## 8. Embeds

Sources: [embed options](https://calendly.com/help/embed-options-overview), [advanced embed](https://calendly.com/help/advanced-calendly-embed-for-developers), [developer embedding](https://developer.calendly.com/api-docs/overview/embedding/getting-started).

| Mode | Description |
|---|---|
| Inline | Booking UI rendered inside the host page |
| Popup widget | Floating button that opens a modal |
| Popup text | Link that opens a modal |

- The embed can target the landing page or a single booking page.
- Advanced options: prefill name, email and answers via URL params; hide details or the GDPR banner; colors; postMessage events (`calendly.event_scheduled`).

## 9. Integrations

Calendly says it has "100+" ([integrations](https://calendly.com/integration)).

| Category | Integrations |
|---|---|
| Calendars | Google, Outlook/O365, Exchange, iCloud (legacy connections only) |
| Video | Zoom, Meet, Teams, Webex, GoTo |
| CRM / marketing | HubSpot, Mailchimp (Standard); Salesforce sync, Marketo, Pardot (Teams); Salesforce lookup routing, Dynamics 365 (Enterprise) |
| Automation | Zapier ([help](https://calendly.com/help/calendly-zapier)), Make, Power Automate |
| Forms (Aug 2026) | Typeform, Google Forms → contacts |
| Other | Slack, LinkedIn messaging, Gmail/Outlook add-ins, Chrome/Firefox/Edge extension **[some unverified]** |

## 10. Team and admin

- **Teams:** org/group structure, managed event types and workflows, advanced permissions.
- **Enterprise:** SSO/SAML, SCIM, domain control, audit logs, a data-deletion API, HIPAA via BAA, onboarding ([pricing](https://calendly.com/pricing), [HIPAA analysis](https://www.accountablehq.com/post/is-calendly-hipaa-compliant-best-practices-and-compliance-tips)).
- **Branding:** logo and colors. Which plan removes the badge is unclear (a third party says Standard). Full white-label is reportedly Enterprise-only.
- **Contacts (light CRM)** ([release notes](https://calendly.com/release-notes)): built automatically from bookings. Since August 2026 users can send email via Gmail/Outlook with templates and AI drafts, and Typeform and Google Forms can create contacts.

## 11. Analytics

Source: [Calendly analytics](https://calendly.com/help/calendly-analytics).

- Up to 1 year of data: created, completed, rescheduled and canceled meetings, plus popular times and event types.
- Filters by user, team or event; routing stats; CSV export. Teams+.

## 12. API, webhooks and MCP

| Surface | Details |
|---|---|
| Auth | OAuth 2.0 apps + Personal Access Tokens |
| REST API v2 | Scheduling, Contacts, Notetaker; OpenAPI spec ([API docs](https://developer.calendly.com/api-docs)) |
| Availability by plan | Most endpoints work on all plans, including Free; some are Enterprise-only ([API overview](https://calendly.com/help/calendly-api-overview)) |
| Scheduling API | "Create Event Invitee" books directly with no iframe, for AI agents and custom UIs; paid ([announcement](https://community.calendly.com/api-webhook-help-61/scheduling-api-now-available-4825), [AI agents guide](https://developer.calendly.com/schedule-events-with-ai-agents)) |
| Webhooks | `invitee.created`, `invitee.canceled`, `routing_form_submission.created`, Contacts and Notetaker events; user or organization scope; paid plan ([webhook guide](https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions), [overview](https://calendly.com/help/webhooks-overview)) |
| MCP | Hosted at `https://mcp.calendly.com` (OAuth 2.1 + PKCE + DCR). It can list event types, find slots, create single-use links, book and cancel. **Not self-hostable** ([MCP docs](https://developer.calendly.com/docs/mcp/calendly-mcp-server)) |
| Rate limits | Documented at [API rate limits](https://developer.calendly.com/api-docs/edca8074633f8-api-rate-limits) (numbers not extracted) |

## 13. AI features (2025–2026)

Sources: [AI product suite press release](https://calendly.com/newsroom/press-release/calendly-new-ai-product-suite), [AI at Calendly](https://calendly.com/help/ai-at-calendly), [Callie review](https://www.usecarly.com/blog/calendly-callie/).

- **Notetaker** (2026-08-19): joins Zoom, Meet or Teams calls and produces a recording, transcript, recap, action items and a follow-up draft. Shareable, searchable recaps followed on 2026-08-24.
- **Callie** (beta): the user CCs it on an email thread and it proposes up to 3 days × 5 slots. "Ask Callie" is an in-app chat over meeting history.
- Also the MCP server, the agent-oriented Scheduling API, and AI-drafted emails. English accounts get these first.

**Mobile and extension:** iOS/Android apps (redesigned 2026-08-19 with a home screen and dark mode). The browser extension is available on Free (share links, one-off meetings, insert times into Gmail/Outlook/LinkedIn).

## 14. Pricing and gating

Source: [calendly.com/pricing](https://calendly.com/pricing), September 2026.

| Plan | Price | Includes / gated |
|---|---|---|
| Free | $0 | 1 event type, 1 calendar, 1:1 only, booking page, extension, polls, one-off. **No** workflows, payments, webhooks or routing |
| Standard | $10/seat/mo (17% off yearly)* | Unlimited event types, 6 calendars, workflows, Stripe/PayPal, HubSpot/Mailchimp, webhooks, Scheduling API, branding removal (per a third party) |
| Standard Plus | ~$18 annual / $24 monthly | + Notetaker, Callie (no round robin or routing) |
| Teams | $16/seat/mo (20% off yearly)* | Round robin, collective, routing forms, managed events/workflows, Salesforce, Marketo/Pardot, admin permissions, routing analytics |
| Teams Plus | ~$24 annual / $32 monthly | + Notetaker, Callie |
| Enterprise | From $15,000/yr, 50-seat minimum | SSO/SAML, SCIM, domain control, audit logs, deletion API, Salesforce lookup routing, Dynamics, HIPAA BAA |

\*Third parties list $12/$20 ([G2 pricing](https://www.g2.com/products/calendly/pricing)). Plus prices are from [usecarly](https://www.usecarly.com/blog/calendly-standard-plus-pricing/).

## 15. Praise vs complaints

| Praise (G2 ~4.7/5, [reviews](https://www.g2.com/products/calendly/reviews)) | Complaints |
|---|---|
| Clean invitee flow with no account needed | Per-seat cost creep and an Enterprise cliff (5 seats ~$960/yr → $15k+/yr, [review](https://www.rapidevelopers.com/review/calendly)) |
| Automatic timezone detection | Very limited Free plan, called a "trap door" ([roast](https://nqz.ai/blog/roast-calendly-day1)) |
| Fast setup, reliable sync | Weak support |
| Brand trust lowers B2B friction | Limited layout/CSS customization; thin branding on low tiers |
| No-code integrations | No new iCloud connections |
| Embeds, mobile app, extension | Round robin and routing locked behind Teams; AI costs extra |
| — | No self-hosting and no data-residency control |

More: [Zeeg pros/cons](https://zeeg.me/en/blog/post/calendly-pros-and-cons-review), [Tomba review](https://tomba.io/blog/calendly-pricing-reviews-pros-and-cons).

### Calendly vs Cal.com

- **Calendly is ahead on** brand, polish, deep sales-stack integrations (Salesforce lookup routing, Dynamics, Marketo, Pardot), native AI (Callie, Notetaker, Contacts email), a hosted MCP server and analytics.
- **Cal.com was ahead on** self-hosting, an API-first design, customization, routing and workflows on cheaper tiers, and value for large teams. On 2026-04-15 it closed its source ([Cal.com blog](https://cal.com/blog/cal-com-goes-closed-source-why), [It's FOSS](https://itsfoss.com/news/cal-com-goes-proprietary/)). Details are in the [Cal.com analysis](./calcom.md).

---

## 16. Lessons for OpenCalendar

### Take

- **The invitee UX bar:** no account, automatic timezone detection, a month-then-slot-then-form flow, and ICS plus reschedule/cancel links in every email. This is the bar for M1.
- **The simple trigger + action workflow model**, with template variables and email first, then SMS.
- **One-off meetings and meeting polls** as cheap features that users like (M5).
- **Embed ergonomics:** three modes, prefill via URL, postMessage events.
- **Outlook status mapping** (Busy / Working Elsewhere / Away) as configurable conflict semantics.
- **An agent-friendly booking API** (book without an iframe), with an MCP server on top later.

### Avoid

- **Feature gating as a business model.** Round robin, collective, routing, workflows, webhooks and payments are all in the open core.
- **Dropping standards-based calendars.** iCloud/CalDAV is a first-class M2 feature.
- **AI as a paid add-on the product depends on.** The core must be excellent without AI, and AI features come after 1.0.
- **A hosted-only MCP server.** When OpenCalendar ships one (post-1.0), it will be self-hostable.

### Improve

- **Branding and CSS freedom** on every install, with no badge.
- **Data ownership:** self-hosting, data residency by default, export everything.
- **Analytics without a Teams tier:** the insights dashboard ships in M5.
- **Transparent availability:** a "why is this slot unavailable" view that Calendly lacks.

See the [feature matrix](./feature-matrix.md) for milestone targets and the [roadmap](../05-roadmap/roadmap.md) for sequencing.
