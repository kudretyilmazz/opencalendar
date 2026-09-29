# OpenCalendar

[![CI](https://github.com/kudretyilmazz/opencalendar/actions/workflows/ci.yml/badge.svg)](https://github.com/kudretyilmazz/opencalendar/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kudretyilmazz/opencalendar)](https://github.com/kudretyilmazz/opencalendar/releases)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

An open-source, self-hostable scheduling platform — an alternative to Cal.com and Calendly.
Booking pages, availability, calendar sync and video links, with team scheduling (round robin,
collective, managed event types, routing forms, workflows) included in the open core.

## Features

- **Booking pages** with time-zone detection, several durations, locations (in person, phone,
  link, Jitsi, Google Meet, Microsoft Teams, Zoom), booking questions with URL prefill, seats,
  recurring bookings, requires-confirmation, limits, single-use links and cancellation policies.
- **Availability** from weekly hours, date overrides and connected calendars (Google, Microsoft
  365, CalDAV such as iCloud/Fastmail/Nextcloud, ICS feeds) — and a troubleshooter that explains
  *why* a time is or isn't bookable.
- **Teams:** collective and round-robin event types (weights, priority, fixed hosts), managed
  event types with locked fields, dynamic group links, a team availability view, routing forms.
- **Automation:** email notifications with calendar invites, reminder workflows, signed webhooks
  with retries, and an embed script (inline, popup, floating button).
- **Self-host first:** one Docker image plus PostgreSQL (no Redis), runtime configuration,
  automatic migrations, health endpoints and Prometheus metrics. AGPL-3.0, no license keys, no
  telemetry.

## Quick start (self-hosting)

```bash
git clone https://github.com/kudretyilmazz/opencalendar.git && cd opencalendar
cp .env.example .env   # set APP_URL, AUTH_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD and SMTP
OPENCALENDAR_IMAGE=ghcr.io/kudretyilmazz/opencalendar:1 docker compose up -d --no-build
```

The app listens on `127.0.0.1:3000`; put a TLS reverse proxy (e.g. Caddy) in front and create
your account right away — the first account becomes the administrator. Full guide:
[self-hosting](./docs/03-architecture/self-hosting.md).

## Documentation

- [User guide](./docs/06-user-guide/README.md) — using OpenCalendar
- [Self-hosting](./docs/03-architecture/self-hosting.md) — install, configure, upgrade, back up
- [Webhooks](./docs/03-architecture/api-and-webhooks.md#webhooks) and [embeds](./docs/03-architecture/embeds.md) — reference
- [Security](./docs/03-architecture/security.md) · [Changelog](./CHANGELOG.md) · [Roadmap](./docs/05-roadmap/roadmap.md)
- Everything else (research, requirements, architecture, ADRs): [`docs/`](./docs/README.md)

## Development

```bash
npm install
npm run services:up   # PostgreSQL, Mailpit and a CalDAV server in Docker
cp .env.example .env  # then set AUTH_SECRET and ENCRYPTION_KEY
npm run db:migrate
npm run dev
```

Tests: `npm test` (unit + integration, needs Docker for Testcontainers), `npm run test:e2e`
(Playwright). See [setup](./docs/04-development/setup.md), [testing](./docs/04-development/testing.md)
and [CONTRIBUTING.md](./CONTRIBUTING.md).

Tech stack: Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL 16 + Drizzle · Better
Auth · pg-boss · Tailwind CSS 4 · Vitest + Playwright.

## Security

Please report vulnerabilities privately — see [SECURITY.md](./SECURITY.md).

## License

[GNU Affero General Public License v3.0](./LICENSE). If you run a modified version as a
service, you must offer its source to your users — set `SOURCE_URL` to your fork (every page
footer links to it).
