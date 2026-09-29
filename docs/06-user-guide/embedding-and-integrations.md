# Embedding and Integrations

Embed your booking page on other websites and get notified of bookings via webhooks.

## Embed your booking page

Place your OpenCalendar booking page on your own website inline, as a popup, or behind a floating button.

The embed works with your profile, an event type, a team page or team event type, a dynamic group link, or a routing form. Visitors can see your availability and book you without leaving your site.

### Get the code from the embed builder

The easiest way: open **Event types**, choose **Embed** in an event type's **…** menu (or **Embed** on your booking page strip, a team page, a team event type or a routing form's **Share** card).

The builder has a tab per embed type — **Inline**, **Floating button**, **Popup** and, for a single event type, **Email**. Pick the theme, brand color, layout (month, week or column), whether to hide the event details and optional prefill values; the live preview shows the real embed on a sample page. Then **Copy code** and paste it into your site. For sites that don't allow scripts, switch the inline code to **iframe** or a plain **Link**.

### Embed times in an email

In the builder's **Email** tab, pick up to 10 free times (browse the weeks, choose the time zone and 12/24-hour clock), add an optional message and click **Copy for email**, then paste into Gmail, Outlook or Apple Mail. Each time is a button that opens your booking page with that time already chosen; if someone else booked it in the meantime, the page opens that day and asks to pick another time. **Copy HTML** (or **Show HTML**) gives the raw source for email tools that take HTML.

The email is a snapshot: it lists the times free when you copied it.

### How to embed by hand

Add the embed script to your website HTML and a placeholder where the booking page should appear. Replace `https://cal.example.com` with your OpenCalendar address and `ada/intro` with `{username}/{event-slug}`:

```html
<div data-opencalendar-inline="ada/intro"></div>
<script src="https://cal.example.com/embed.js" defer></script>
```

The frame's height follows the booking page automatically.

**Embed modes:**
- **Inline** — `<div data-opencalendar-inline="ada/intro"></div>` shows the booking page inside your page.
- **Popup** — any element with `data-opencalendar-link="ada/intro"` (e.g., a button) opens the booking page in a dialog when clicked.
- **Floating button** — call `OpenCalendar.floatingButton({ calLink: "ada/intro" })` to show a "Book a meeting" button in the bottom-right corner (or `position: "bottom-left"`).

The link (`calLink`) can be `username`, `username/event-slug`, `team/team-slug` or `team/team-slug/event-slug`, `user1+user2/event-slug`, or `forms/form-id`.

### Customize the embed

Add a `data-opencalendar-config` attribute with JSON (or pass `config` in JavaScript), for example:

```html
<div data-opencalendar-inline="ada/intro" data-opencalendar-config='{"theme":"dark","brand":"#0f766e"}'></div>
```

Options include `theme` (`light`, `dark` or `auto`), `brand` (a hex color), `layout` (`month`, `week` or `column`), `hideDetails` (hides the event details column), prefill values such as `name`, `email`, `notes`, `duration`, `date` and booking question answers, and `utm_*` parameters.

### Booking links

Any booking link accepts `?layout=week` (or `month`, `column`), `?date=2026-10-02`, `?month=2026-10`, `?duration=45` and `?slot=` with an exact start time in UTC (for example `2026-10-02T07:00:00.000Z`), which opens the booking form on that time. Visitors can also switch between the month, week and column layouts themselves; on phones the page always uses the column layout.

Your website can also listen for events from the booking page, such as `bookingSuccessful`, with `OpenCalendar.on("bookingSuccessful", handler)`.

See the [Embeds reference](../03-architecture/embeds.md) for the JavaScript API, all options and events, auto-resize, and the framing policy.

## Webhooks

Receive HTTP notifications when bookings happen or routing forms are submitted. Use webhooks to, for example, sync bookings to your CRM or trigger internal workflows.

### Create a webhook

1. Click **Webhooks** in the menu.
2. Under **Add a webhook**, enter the **Endpoint URL** where you want to receive notifications. It must be a public https:// address (unless your administrator allows private addresses).
3. Under **Event types**, keep **All my event types** or choose one event type.
4. Choose the **Triggers**:
   - Booking created
   - Booking requested (needs confirmation)
   - Booking cancelled
   - Booking rescheduled
   - Booking rejected
   - No-show updated
   - Meeting ended
   - Routing form submitted
5. Click **Create webhook**.
6. Copy the **Signing secret (shown once)** with **Copy secret**. You need it to verify requests.

These webhooks cover your personal event types and routing forms. For team event types and team routing forms, team admins add webhooks on the team page under **Webhooks** → **Add a team webhook**.

### Manage a webhook

For each webhook you can:
- **Pause** or **Resume** it.
- Change its triggers and click **Save triggers**.
- Click **Send test ping** to send a test request.
- Click **Roll secret** to create a new signing secret. The old secret stops working immediately.
- **Delete** it.

### Webhook payloads

When an event happens, OpenCalendar sends a POST request with a JSON body to your URL. The body contains:
- `version` (currently `1`), a delivery `id`, the `trigger` (e.g., `BOOKING_CREATED`) and `createdAt`.
- `payload` — for bookings, the booking details (title, status, start and end, time zone, location, event type, organizer, attendees, answers to booking questions, UTM parameters, no-show flags). A rescheduled booking's payload is the new booking and includes `rescheduledFromUid`, the uid of the original booking.

Each request has these headers:
- `X-OpenCalendar-Event` — the trigger.
- `X-OpenCalendar-Delivery` — the delivery id.
- `X-OpenCalendar-Signature` — `t=<unix seconds>,v1=<signature>`, where the signature is the hex HMAC-SHA256 of `<t>.<raw body>` with your signing secret.

See the [webhook reference](../03-architecture/api-and-webhooks.md#webhooks) for payload schemas and signature verification.

### Retry and delivery log

A delivery succeeds when your endpoint answers with a 2xx status within 10 seconds. Redirects are not followed. If it fails, OpenCalendar retries automatically up to 10 times, with growing delays (starting at about a minute, and at most 6 hours apart). Deliveries to blocked addresses fail at once without retries.

Each webhook shows its **Recent deliveries** with time, trigger, status, response code, latency and number of attempts. Click **Retry** to send a failed delivery again.

### Troubleshooting webhooks

- **Signature mismatch** — Check you use the current signing secret (after **Roll secret**, only the new one works) and sign the raw request body.
- **Timeout** — Make sure your endpoint responds within 10 seconds.
- **Delivery log shows errors** — Check the response code and your endpoint's logs.

## API access

There is no public REST API or API keys in OpenCalendar 1.0. They are planned for a later release (see the [roadmap](../05-roadmap/roadmap.md#m5--platform)). To connect OpenCalendar to other systems today, use webhooks and embeds.

## Third-party integrations

Currently, OpenCalendar integrates with:

- **Google Calendar** — Read busy times, add bookings, Google Meet links.
- **Microsoft 365 / Outlook** — Read busy times, add bookings, Microsoft Teams links.
- **CalDAV** (iCloud, Fastmail, Nextcloud and others) — Read busy times, add bookings.
- **ICS feeds** — Read busy times (read-only).
- **Zoom** — Create meeting links.
- **Jitsi Meet** — Create meeting links (no account needed).

Google, Microsoft and Zoom are available when your administrator has set them up. See [Calendars](./calendars.md) for connection instructions.

## Build custom integrations

Use webhooks to connect OpenCalendar to other systems. Example use cases:

- Sync bookings to a CRM.
- Create a ticket in your support tool when a booking is made.
- Post a message to your team chat when a routing form is submitted.

See the [webhook reference](../03-architecture/api-and-webhooks.md#webhooks) for payloads and signature verification.
