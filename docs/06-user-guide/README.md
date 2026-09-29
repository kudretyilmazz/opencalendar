# User Guide

How to use OpenCalendar to schedule meetings with your team and the world.

**Last updated:** 2026-09-29

## Getting started

Start here if you're new to OpenCalendar: [Getting started](./getting-started.md) covers account setup, email verification, and your public booking page.

## Key concepts

- **Availability** - When you accept bookings, defined by schedules (weekly working hours) and date overrides. See [Availability](./availability.md).
- **Event types** - Bookable meeting templates, such as "30-minute intro" or "1-hour consultation". See [Event types](./event-types.md).
- **Bookings** - Meetings booked through your event types. View, accept, cancel them, or ask the invitee to pick a new time. See [Bookings](./bookings.md).
- **Calendars** - Connect Google Calendar, Microsoft 365 / Outlook, a CalDAV calendar or an ICS feed to block availability when you're busy elsewhere. See [Calendars](./calendars.md).
- **Teams** - Work with colleagues using collective (everyone attends), round-robin (one host per booking) or managed event types. See [Teams](./teams.md).
- **Routing forms** - Ask qualifying questions and send visitors to the right event type, an external URL or a message. See [Routing forms](./routing-forms.md).

## Common tasks

- [How do I publish my booking page?](./getting-started.md#publish-your-booking-page) — Verify your email, choose a username and create an event type.
- [How do I set my working hours?](./availability.md#create-or-edit-a-schedule) — Define a schedule with weekly hours.
- [How do I block time off?](./availability.md#add-a-date-override) — Add a date override for holidays or unexpected closures.
- [How do I set up a meeting link (Zoom, Google Meet, Microsoft Teams)?](./event-types.md#add-a-location) — Add a location to the event type.
- [Can I limit how many times I'm booked per week?](./event-types.md#set-booking-and-duration-limits) — Yes, with booking frequency and total booked time limits.
- [How do I know why no slots are showing?](./availability.md#troubleshoot-your-availability) — Use the troubleshooter to see every possible start time of a day and why it is or isn't available.
- [Can multiple people be booked at once (group events)?](./event-types.md#enable-seats) — Yes, with seats.
- [How do I require approval before bookings are confirmed?](./event-types.md#require-confirmation) — Turn on **Requires confirmation** on an event type.

## Integrations & references

- **Embedding** - Place your booking page on your own website. See [Embedding and integrations](./embedding-and-integrations.md).
- **Webhooks** - Receive notifications when bookings happen. See [Webhooks](./embedding-and-integrations.md#webhooks) and the [webhook reference](../03-architecture/api-and-webhooks.md#webhooks). There is no public REST API or API keys in 1.0.
- **Self-hosting** - Run OpenCalendar on your own infrastructure. See the [Self-hosting guide](../03-architecture/self-hosting.md).

## Need help?

Check the [troubleshooter](./availability.md#troubleshoot-your-availability) first — it explains why slots are or aren't available.

For technical issues, check the self-hosting guide and the webhook reference.
