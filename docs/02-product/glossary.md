# Glossary

Definitions of the scheduling terms used across OpenCalendar's documentation, code and UI.

Last updated: 2026-09-28

Related: [Requirements](./requirements.md) · [User flows](./user-flows.md) · [Data model](../03-architecture/data-model.md) · [Availability engine](../03-architecture/availability-engine.md)

---

Terms are listed alphabetically. Where the code uses a different identifier from the UI label, the identifier is shown in `code`. Requirement IDs refer to [requirements.md](./requirements.md).

**API key**
: A personal secret used to authenticate against the REST API. It has a name, scopes and an optional expiry. It is shown only once and stored hashed (API-007).

**Attendee / Booker**
: The person who books a meeting. *Booker* means the person using the booking page. *Attendee* means every non-host participant stored on a booking, including the booker and any guests they add. Attendees don't need an account. `Attendee`.

**Audit log**
: An append-only record of security-relevant actions, each with actor, IP and timestamp (ADM-010).

**Availability**
: The set of time ranges during which a host can be booked for a given event type. It is computed as working hours (from a schedule and date overrides) minus busy time, then constrained by minimum notice, booking horizon and limits. See [availability engine](../03-architecture/availability-engine.md).

**Availability engine**
: The pure, deterministic module that turns availability inputs into bookable slots and, optionally, reason codes (AVL-003, AVL-005).

**Booking**
: A reserved time between one or more hosts and one or more attendees for an event type. Its status is one of `PENDING`, `ACCEPTED`, `AWAITING_PAYMENT`, `REJECTED`, `CANCELLED` or `RESCHEDULED`. Each booking has an unguessable `uid`.

**Booking horizon**
: How far into the future an event type can be booked. It is either rolling (the next N calendar or business days), a fixed date range, or unlimited (EVT-005). Also called the *future booking limit* or *date range*.

**Booking question**
: A custom field on the booking form, such as text, select or phone. Each question can be required, optional or hidden (EVT-009).

**Buffer**
: Padding in minutes before and/or after a booking. During the buffer the host counts as busy, but the buffer doesn't appear as part of the meeting (EVT-003). Example: a 30-minute meeting with a 10-minute after-buffer blocks 40 minutes.

**Busy time**
: A time range when a host can't be booked. Sources are existing bookings (with buffers), events on conflict calendars, active slot holds, OOO entries, holidays and periods where a limit has been reached. Busy times are cached per calendar (AVL-006, AVL-007).

**CalDAV**
: An open standard (RFC 4791) for accessing calendars over WebDAV. It is used for iCloud, Fastmail, Nextcloud and many other servers (INT-004).

**Collective event**
: A team event type that all assigned hosts attend. A slot is offered only when every host is free (TEAM-004). `schedulingType = COLLECTIVE`.

**Conflict calendar**
: A connected calendar whose events are read as busy time when availability is computed. A user can pick several conflict calendars, and an event type can override the selection (INT-006). Also called a *selected calendar*.

**Credential**
: The encrypted authentication material for an integration, such as OAuth tokens or a CalDAV app password (INT-001).

**Date override**
: A replacement for a schedule's weekly hours on one specific date, either with custom ranges or as unavailable all day (AVL-002).

**Destination calendar**
: The calendar where OpenCalendar writes events for new bookings. Each user sets a default, and an event type can override it (INT-007).

**Dynamic group link**
: An ad-hoc URL that combines usernames, such as `/alice+bob`. It creates a collective booking among those users without a predefined team event type (TEAM-009).

**Embed**
: OpenCalendar booking UI placed on a third-party website as an inline iframe, a popup or a floating button. It communicates with the host page through `postMessage` (EMB-001–005).

**Event type**
: A bookable meeting template with its own URL, such as "30 min intro". It defines duration(s), location(s), schedule, buffers, notice, horizon, limits, questions and policies (EVT-*). `EventType`.

**Fixed host**
: In a round-robin event type, a host who attends every booking in addition to the rotating host (TEAM-007).

**Frequency limit / Duration limit**
: Caps on how many bookings (frequency) or how many booked minutes (duration) an event type accepts per day, week, month or year (EVT-010).

**Hidden event type**
: An event type that doesn't appear on the profile page but can still be booked through its direct link (EVT-014).

**Hold (slot reservation)**
: A short-lived lock on a slot, placed when a booker starts filling in the form, so other bookers don't pick the same time. It expires after 5 minutes by default (BKG-006).

**Host**
: A user who owns or attends a booking on the provider side. A personal event type has one host. A team event type has several, and each host can have a weight, a priority and a schedule. `Host`.

**ICS / iCalendar**
: The calendar data format defined in RFC 5545. OpenCalendar attaches ICS files (`METHOD:REQUEST` or `CANCEL`) to emails and can subscribe to read-only ICS feeds (NTF-002, INT-005).

**Location**
: Where a meeting takes place: a video provider (Google Meet, Teams, Zoom, Jitsi), a static link, an in-person address or a phone call. An event type can offer several locations (EVT-007, EVT-008).

**Managed event type**
: An event type template that a team admin defines and assigns to members. Locked fields can't be changed by members, and template updates propagate to members' copies (TEAM-008).

**Meeting poll**
: A scheduling mode where the host proposes candidate times, participants vote, and the winning time is booked (EVT-019).

**Minimum notice**
: The shortest lead time before a slot's start at which it can still be booked. Example: with 4 hours' notice, a booker at 09:00 sees 13:00 as the earliest slot (EVT-004).

**No-show**
: A mark on a past booking saying an attendee, or the host, didn't attend. It is used in insights and webhooks (BKG-013).

**One-off meeting**
: A single-use booking link offering only the specific times a host picked (EVT-018).

**OOO (Out of office)**
: A date range when a user is unavailable. It can include a reason and a redirect to another user, which the booking page shows to bookers (AVL-009).

**Profile page**
: The public page at `/{username}` (or `/team/{slug}`) that lists visible event types (BKG-001, TEAM-001).

**Reason code**
: A machine-readable explanation of why a candidate slot is unavailable, such as `BUSY_CALENDAR`, `BUFFER`, `MIN_NOTICE` or `LIMIT_REACHED` (AVL-005).

**Recurring event**
: An event type that lets the booker reserve a series of occurrences (weekly or monthly, up to a maximum count) in one booking action (EVT-013).

**Requires confirmation**
: An event type setting under which new bookings stay `PENDING` until the host accepts or rejects them. The slot is held in the meantime (EVT-011, BKG-012).

**Round robin**
: A team event type in which each booking goes to one host from a pool. Bookers see a slot if any pool host is free. At booking time, the host is picked among the free hosts by fairness, weights and priority (TEAM-005, TEAM-006). `schedulingType = ROUND_ROBIN`.

**Routing form**
: A qualification form whose answers are evaluated against ordered rules to send the respondent to an event type, an external URL or a message (RTE-001–003).

**Routing trace**
: The stored record of how a routing form submission, or a round-robin host choice, was decided (RTE-005, TEAM-006).

**Schedule**
: A named set of weekly working hours in a specific IANA timezone, plus date overrides. A user can have many schedules, and one of them is the default (AVL-001).

**Seats**
: A per-slot capacity that lets several independent attendees book the same time (group events). The slot stays available until all seats are taken (EVT-012).

**Single-use link**
: A private URL for an event type that allows exactly one booking and can optionally expire (EVT-015). `HashedLink`.

**Slot**
: A specific bookable start time, with a duration, that the engine offers on the booking page. A slot is valid only if the whole duration plus buffers fits inside availability.

**Slot interval**
: The spacing between consecutive slot start times, such as every 15 minutes. It defaults to the event duration (EVT-006). It is also called *start time increment*.

**Team**
: A group of users with roles (Owner, Admin, Member) that shares event types, workflows, routing forms and branding (TEAM-001–003).

**Travel schedule**
: A temporary timezone override for a date range. A host who travels keeps the same local working hours in the new timezone (AVL-011).

**Webhook**
: An HTTP POST that OpenCalendar sends to a subscriber URL when a booking or form event happens. Each request is signed with HMAC-SHA256, and failed deliveries are retried (API-001–005).

**Weight / Priority**
: Round-robin tuning. *Weight* sets a host's proportional share of bookings. *Priority* breaks ties between equally loaded hosts (TEAM-006).

**Workflow**
: An automation that connects a trigger (booking created, cancelled, rescheduled, before start, after end) to an action (send an email or SMS) with a templated message (NTF-005, NTF-009).

**Working hours**
: The time ranges during which a host accepts bookings, derived from a schedule and its date overrides before busy time is subtracted.
