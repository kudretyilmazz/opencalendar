# ADR-0006: CalDAV-first calendar strategy with Google and Microsoft adapters

All calendars sit behind one CalendarAdapter interface; CalDAV (via tsdav) is a first-class provider next to Google and Microsoft Graph.

Last updated: 2026-09-28

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** [../03-architecture/integrations.md](../03-architecture/integrations.md), [../01-research/calendly.md](../01-research/calendly.md)

## Context

- Calendly blocked new iCloud connections in August 2024; self-hosters often use Nextcloud,
  Fastmail, Radicale or iCloud. Standards-based CalDAV serves that audience.
- Google and Microsoft users are the majority; their native APIs give better free/busy,
  push notifications and built-in Meet/Teams links.
- Cal.com has ~130 apps with generated registries; we want a small, explicit set.

Verified in tsdav docs (Context7, `/natelindev/tsdav`):

- `createDAVClient({ serverUrl, credentials, authMethod: 'Basic' | 'Oauth', defaultAccountType: 'caldav' })`
  (iCloud example: `https://caldav.icloud.com` with an app-specific password).
- `fetchCalendars`, `fetchCalendarObjects({ calendar, timeRange, expand })`,
  `createCalendarObject({ calendar, filename, iCalString })`, plus update/delete.
- `freeBusyQuery` exists but "many providers, such as Google and Apple, do not support" it.

## Decision

- Define one **`CalendarAdapter`** interface (`listCalendars`, `getBusy`, `createEvent`,
  `updateEvent`, `deleteEvent`, optional `watch`). Core code only talks to this interface.
- Ship in **M2**: `caldav` (tsdav), `google` (Calendar API), `microsoft` (Graph), `ics-feed`
  (read-only). All are equal citizens; CalDAV is tested in CI against a Radicale container.
- CalDAV busy times are computed from `fetchCalendarObjects` with `timeRange` and `expand: true`
  (not `freeBusyQuery`, due to poor server support), then reduced to opaque/busy intervals.
- Busy times are fetched **on demand** with a short TTL cache (`calendar_busy_cache`);
  push (Google watch channels, Graph subscriptions) is an optimization added later.
- Events are written as standard **iCalendar** (`ics` library) for CalDAV, so the invitation
  content is identical across providers.
- Adapters are registered in a plain TypeScript map (`lib/integrations/registry.ts`), no codegen.

## Consequences

### Positive

- Works with any standards-compliant server, including iCloud and Nextcloud.
- Adding a provider is one folder and one registry line.

### Negative

- CalDAV servers differ (recurrence expansion, time zone handling); we need a compatibility
  test suite and per-server quirks.
- Event-level fetch is heavier than a free/busy endpoint; caching is required.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Google/Microsoft only | Less work | Excludes iCloud/Nextcloud users | Against self-host audience |
| Nylas / Cronofy aggregator | One API | Paid, external data processor | Privacy and cost |
| Google via CalDAV too | One code path | Loses Meet links, push, worse quotas | Native API is better |
