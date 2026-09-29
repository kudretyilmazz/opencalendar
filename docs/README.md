# OpenCalendar Documentation

Research, product definition, architecture, development guides and roadmap for OpenCalendar, an open-source, self-hostable alternative to Cal.com and Calendly.

Last updated: 2026-09-28

## Why OpenCalendar?

In April 2026 Cal.com went closed source. Its public successor, Cal.diy, is labelled "non-production" and has no team scheduling, round robin, routing forms, workflows or SSO. Calendly is proprietary and puts team features behind per-seat plans, with a $15k/yr Enterprise tier on top.

**OpenCalendar's goal:** a production-grade, fully open-source (AGPLv3) scheduling platform. Team features are part of the core, it self-hosts in one command, and its availability can be explained.

## How to read these docs

| # | Section | Start here if you want to… |
|---|---|---|
| 01 | [Research](./01-research/) | understand the competitors and the market gap |
| 02 | [Product](./02-product/) | know **what** we build and why |
| 03 | [Architecture](./03-architecture/) | know **how** it is built |
| 04 | [Development](./04-development/) | set up, write code and test |
| 05 | [Roadmap](./05-roadmap/roadmap.md) | see **when** each feature is planned |
| 06 | [User Guide](./06-user-guide/) | learn how to use OpenCalendar |
| — | [ADRs](./adr/) | see why key decisions were made |

## Index

### 01 · Research
- [Cal.com analysis](./01-research/calcom.md)
- [Calendly analysis](./01-research/calendly.md)
- [Open-source landscape](./01-research/landscape.md)
- [Feature matrix](./01-research/feature-matrix.md): Cal.com vs Cal.diy vs Calendly vs OpenCalendar

### 02 · Product
- [Vision & positioning](./02-product/vision.md)
- [Requirements](./02-product/requirements.md): functional and non-functional, with stable IDs
- [User flows](./02-product/user-flows.md)
- [Glossary](./02-product/glossary.md)

### 03 · Architecture
- [Tech stack](./03-architecture/tech-stack.md)
- [System overview](./03-architecture/system-overview.md)
- [Data model](./03-architecture/data-model.md)
- [Availability engine](./03-architecture/availability-engine.md)
- [Integrations](./03-architecture/integrations.md)
- [API & webhooks](./03-architecture/api-and-webhooks.md)
- [Embeds](./03-architecture/embeds.md): inline/popup embed snippets, postMessage events, framing policy
- [Security](./03-architecture/security.md)
- [Self-hosting](./03-architecture/self-hosting.md)

### 04 · Development
- [Local setup](./04-development/setup.md)
- [Conventions](./04-development/conventions.md)
- [Testing strategy](./04-development/testing.md)
- [Implementation steps](./04-development/implementation-steps.md): the ordered task checklist we work from

### 05 · Roadmap
- [Roadmap](./05-roadmap/roadmap.md): milestones M0–M6, the v1.0 criteria, and post-1.0 plans

### 06 · User Guide
- [Getting started](./06-user-guide/getting-started.md): sign up, verify email, set username and time zone
- [Availability](./06-user-guide/availability.md): create schedules, add date overrides, troubleshoot
- [Event types](./06-user-guide/event-types.md): create and configure bookable meetings
- [Bookings](./06-user-guide/bookings.md): manage bookings, accept/reject, reschedule, cancel
- [Calendars](./06-user-guide/calendars.md): connect Google, Microsoft 365, CalDAV
- [Teams](./06-user-guide/teams.md): work with colleagues, collective, round-robin scheduling
- [Routing forms](./06-user-guide/routing-forms.md): qualify leads and route to event types
- [Embedding and integrations](./06-user-guide/embedding-and-integrations.md): embed on your website, webhooks, API

### Architecture Decision Records
- [ADR index](./adr/README.md)

## Keeping docs current

- Requirement IDs (e.g. `BKG-004`) link product, code, tests and commits. Reference them everywhere.
- A PR that changes behavior updates the matching doc in the same PR.
- New architectural decisions get a new ADR (copy [0000-template](./adr/0000-template.md)). Never rewrite an accepted ADR; supersede it with a new one.
