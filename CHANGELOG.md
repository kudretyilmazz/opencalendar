# Changelog

All notable changes to OpenCalendar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Upgrades within a major version are "pull the new
image and restart"; migrations run automatically (see
[self-hosting](docs/03-architecture/self-hosting.md#upgrades)).

## [Unreleased]

## [1.2.0] - 2026-10-01

### Added
- Instance administration (ADM-009): an **Administration** area for instance admins, with an
  overview, and a users page to search and filter accounts, make or remove admins, disable, enable
  and delete accounts. Admins can't remove their own access and the last active admin is always
  kept.
- White-label branding (ADM-011), changeable without a redeploy:
  - App name and description in page titles, headers and emails; logo, dark-mode logo, favicon and
    home-screen icon uploads (stored in PostgreSQL).
  - Separate switches to hide "Powered by OpenCalendar" and the footer source link. A hidden
    source link is replaced by an **About** link; the new `/about` page always offers the source
    code (AGPL-3.0 section 13).
  - Theme: primary and highlight colors for light and dark mode, corner radius and the default
    color mode, with a live preview. Colors too close to the page background are refused.
  - Emails: button color and footer text; the logo is included when it is PNG, JPEG or WebP.
- Platform settings: a sign-up mode that overrides `SIGNUP_MODE`, home page and sign-in texts,
  hiding configured Google/Microsoft sign-in buttons, and defaults (time zone, week start, time
  format) for new accounts.

### Changed
- Text on team and embed brand colors is now chosen for contrast, so light brand colors stay
  readable on booking pages and routing forms.
- `about` is now a reserved username.

### Upgrading
- Migration `0013_instance_settings` runs automatically and adds two tables. Instances that aren't
  customized look and behave exactly as before; `SIGNUP_MODE` keeps applying until an admin picks
  another mode.

## [1.1.0] - 2026-09-30

### Changed
- The UI is built on shadcn/ui: dates use a calendar popover, times a slot picker, time zones a
  searchable list, confirmations a dialog; no browser-default form controls remain.
- A new dashboard home: today's and tomorrow's bookings with join, accept and decline, this week
  at a glance (meetings, requests, no-shows), your booking link, event types and working hours. New
  accounts get a setup checklist with progress and a one-click "use my time zone".
- Grouped sidebar navigation with icons and a count of bookings awaiting confirmation; a menu
  sheet on phones.
- Every dashboard page redesigned in the same language: event types (filters, search, weekly
  counts, on/off switch, actions menu, team event types), bookings (tab counts, date-range filter,
  rows grouped by day with expandable details; Upcoming now includes requests awaiting
  confirmation), availability (schedule switcher, week at a glance, copy hours to other days),
  settings (sectioned layout, theme tiles), calendars (per-calendar conflict switch and destination,
  connect dialogs), teams (cards with stats, members table), routing forms (response trend, latest
  responses, rules summary) and webhooks (health, delivery table with a failed filter).
- Destructive actions (delete schedule, team, event type, routing form, webhook, account; disconnect
  a calendar) ask for confirmation first.

### Added
- Embed builder: an **Embed** action on event types, the booking page, teams, team event types and
  routing forms opens a builder with inline, floating button, popup and email tabs, options (theme,
  brand color, layout, hide details, prefill, button), a live preview and copy-ready HTML, iframe or
  link code.
- Email embed: pick free times and paste them into an email (Gmail/Outlook/Apple Mail-safe HTML or
  plain text); each time opens the booking form on that time.
- Week and column layouts for booking pages and embeds, with a layout switcher for bookers, and
  `slot=` / `month=` booking link parameters.
- A Coolify template (`deploy/coolify/opencalendar.yaml`): paste it into a Docker Compose Empty
  resource, set SMTP and deploy; Coolify generates the secrets and the domain.

### Fixed
- Saving the schedule, event type, routing form, workflow or team forms no longer snaps checkboxes,
  switches and selects back to their first value on screen.

## [1.0.0] - 2026-09-29

First stable release: self-hostable scheduling with team features in the open core (AGPL-3.0).

### Scheduling
- Availability schedules with weekly hours, date overrides and several schedules per person; a
  pure, deterministic availability engine (time zones and DST, buffers, minimum notice, booking
  window, slot interval, limits, seats) and a troubleshooter that explains why a time is not
  offered.
- Event types: several durations, locations (in person, phone, link, Jitsi, Google Meet,
  Microsoft Teams, Zoom), booking questions with URL prefill and UTM capture, requires
  confirmation, seats, weekly/monthly recurring bookings, frequency and duration limits, hidden
  event types and single-use private links, redirect after booking, cancellation and reschedule
  policies, locked time zone, custom event names.
- Public booking pages with time-zone detection, slot holds while the form is filled in,
  double-booking protection in the database, reschedule and cancel links, accept/reject for
  pending requests, no-show marking.

### Calendars and video
- Google Calendar, Microsoft 365, CalDAV (iCloud, Fastmail, Nextcloud, …) and ICS feeds as
  conflict calendars, a destination calendar per person or event type, Google Meet, Teams and
  Zoom meeting links. Credentials are encrypted (AES-256-GCM, key rotation supported).

### Teams
- Teams with owner/admin/member roles, email invitations and a public team page.
- Collective and round-robin event types (weights, priority, fixed hosts, the reason for each
  assignment is stored), managed event types with locked fields, dynamic group links (opt-in),
  a team availability view, team workflows, and member removal that reassigns or cancels their
  future team bookings.
- Routing forms: builder, ordered AND/OR rules, mandatory fallback, prefill into booking
  questions, stored trace per submission with CSV export, embeddable and headless routing.

### Automation and integrations
- Email notifications with iCalendar attachments, email workflows and a default 24-hour
  reminder.
- Signed webhooks (HMAC-SHA256) for personal and team scopes, including routing-form submissions,
  with retries, an SSRF guard and a delivery log.
- Reminder workflows carry working cancel/reschedule links; event-type descriptions support a
  safe Markdown subset.
- Embed script (inline, popup, floating button) with `postMessage` events, auto-resize and a
  `frame-ancestors` allow-list.

### Operations and security
- `node cli.js migrate | rotate-keys | create-admin` for operators (encryption key rotation
  re-encrypts every stored secret).
- One Docker image (web, worker, CLI) and a `docker compose up -d` stack with PostgreSQL only
  (no Redis); runtime configuration; automatic, forward-only migrations; health endpoints
  (`/api/health/live` reports the version) and Prometheus metrics.
- Email + password, magic link, Google and Microsoft sign-in; account lockout and rate limits;
  per-request CSP nonces; optional self-hosted proof-of-work CAPTCHA (ALTCHA); account deletion.
- Every page links to the source code (AGPL-3.0 §13); set `SOURCE_URL` if you run a fork.

### Known limitations
See the verification notes and deviations per milestone in
[implementation steps](docs/04-development/implementation-steps.md) and the requirement status in
[traceability](docs/05-roadmap/traceability.md). In short:
- Google, Microsoft 365 and Zoom were verified with contract tests and fakes, not yet with live
  accounts; CalDAV was verified against a real server.
- Team event types have no seats, recurring series or single-use links; calendar events are
  written to the organizer's calendar only (co-hosts are invited); seated bookings and recurring
  series can't be rescheduled as a whole.
- No public REST API or API keys yet (planned, roadmap M5); webhooks and embeds are the
  integration points. Payments, insights and translations are also M5.
- No session list or password-change screen yet (password reset works and signs out everywhere).
