# Event Types

Event types are bookable meeting templates. You can have multiple event types with different durations, locations, questions, and policies.

## Create an event type

1. Click **Event types** → **New event type**.
2. Enter a **Title** (e.g., "30-min intro call"). The **URL** is filled in from the title; you can change it.
3. Set the **Default duration (minutes)** (5–720).
4. Optionally add a **Description**. It supports Markdown (bold, italic, code, links, lists and headings).
5. Optionally add a location under **Locations** (see [Add a location](#add-a-location)).
6. Click **Create event type**.

New event types are turned on. People can book them once your email is verified and you have a username.

New event types start with these defaults: 2 hours minimum notice, bookable up to 60 calendar days ahead, up to 5 additional guests, and a "24-hour reminder" workflow.

## Edit event type basics

Click an event type in the list to open its editor. You can change:

- **Title** and **URL** — the URL is the path of the booking page (e.g., `/{username}/intro`).
- **Description** — shown on your booking page.
- **Default duration (minutes)** — how long the meeting lasts.
- **Availability schedule** — which working hours apply. **Default schedule** uses your default schedule.
- **Locations** — where the meeting takes place.

Click **Save changes** after any change. **Open booking page ↗** opens the public page.

## Manage your event types

From **Event types**, you can:

- **Turn off** — The event type disappears from your booking page and can't be booked; its settings are kept.
- **Turn on** — Makes it bookable again.
- **Duplicate** — Copies it to a new event type.
- **↑** and **↓** — Change the order on your booking page.
- **Delete** — Removes it. This isn't possible while it has upcoming bookings; turn it off instead, or cancel those bookings first.

## Durations

### Set multiple durations

Some meetings might be 30 minutes or 1 hour, and you want the booker to choose.

1. In the editor, under **Duration**, tick durations under **Also let bookers choose** (15, 20, 30, 45, 60, 90 or 120 minutes).
2. Click **Save changes**.

The booking page shows a **Duration** choice with all options.

### Start times

By default, start times are spaced by the meeting duration. For example, with a 30-minute meeting and start times every 15 minutes, the booker sees 09:00, 09:15, 09:30, 09:45, etc.

To change it:
1. In the editor, under **Duration**, set **Start times every (minutes)** (5–720). Leave it empty to use the meeting duration.
2. Click **Save changes**.

## Buffers and timing

### Add before/after buffers

A buffer is time before or after a booking that is blocked on your calendar but isn't part of the meeting.

1. In the editor, under **Limits**, set **Buffer before (minutes)** and/or **Buffer after (minutes)** (0–240).
2. Click **Save changes**.

Example: a 30-minute meeting with a 10-minute after-buffer blocks 40 minutes of your time.

### Minimum notice

Prevent bookings that are too close to the start time.

1. Under **Limits**, set **Minimum notice** as a number of minutes, hours or days (up to 365 days).
2. Click **Save changes**.

Example: with 4 hours' notice, a booker at 09:00 can't book a time before 13:00.

### Booking window

Control how far in the future bookings can be made.

1. Under **Limits**, choose **Bookable**:
   - **Up to N calendar days ahead** — e.g., the next 60 days.
   - **Up to N business days ahead** — weekends are not counted.
   - **Within a date range** — set **From** and **To** dates.
   - **Indefinitely** — no limit.
2. For the first two, enter the number of **Days** (1–730).
3. Click **Save changes**.

## Add a location

Each event type can have several locations; with more than one, the invitee chooses when booking. Each location type can only be added once.

### Supported location types

- **In person** — Enter an address.
- **Phone call (invitee calls you)** — Enter your phone number in international format (e.g., +90 555 123 4567).
- **Phone call (you call the invitee)** — Invitees enter their phone number when booking.
- **Custom meeting link** — Enter an http(s) link.
- **Jitsi Meet** — A unique Jitsi room is created for every booking.
- **Google Meet** — Requires Google Calendar connected and set as the destination calendar; a link is created per booking.
- **Microsoft Teams** — Requires Microsoft 365 connected and set as the destination calendar; a link is created per booking.
- **Zoom** — Requires a connected Zoom account; a link is created per booking.

To add a location:
1. In the editor, under **Locations**, choose a type in **Add a location** and click **Add**.
2. Enter the address, phone number or link if the type needs one.
3. Click **Save changes**.

Meeting links appear on the booking's confirmation page and in the confirmation email.

## Booking questions

Ask custom questions on the booking form to gather information (e.g., "What's your company name?", "How did you hear about us?"). Name and email are always asked.

1. In the editor, under **Booking questions**, choose a type in **Add a question** and click **Add question**:
   - Short text, Long text, Number, Email, Phone, Link (URL)
   - Dropdown, Multiple choice (dropdown), Radio buttons, Checkboxes — need options
   - Yes / no
2. Enter the **Question** ("Company name").
3. Check the **Identifier** (e.g., `company`). It is used for URL prefill and webhooks.
4. For option-based types, enter the **Options (one per line)** (up to 30).
5. Tick **Required** if needed, or **Hidden (prefill only)** for a question that is only filled from the URL (hidden questions can't be required).
6. Click **Save changes**.

You can add up to 30 questions. Answers are shown with the booking in **Bookings** and in the host's emails. You can prefill answers with URL parameters named after the identifier (e.g., `?company=acme`), and the booker's details with `name`, `email` and `notes`.

### Reserved identifiers

You can't use these question identifiers: `name`, `email`, `notes`, `guests`, `phone`, `duration`, `date`, `month`, `slot`, `embed`, `reschedule`, `token`, `link`.

## Set booking and duration limits

Limit how many bookings or booked minutes an event type accepts per day, week, month, or year.

1. In the editor, under **Advanced**, set:
   - **Limit booking frequency** — max bookings per period (e.g., 2 per day).
   - **Limit total booked time** — max booked minutes per period (e.g., 480 per week).
2. Leave a field empty for no limit.
3. Click **Save changes**.

Example: to allow at most 40 hours a week, set **Minutes per week** to 2400.

## Enable seats

Seats let several people book the same time slot (group events, workshops). The time stays available until all seats are taken, and the booking page shows how many seats are left.

1. In the editor, under **Advanced**, set **Seats per time slot** (e.g., 4). Leave it empty for 1:1 meetings.
2. Optionally tick **Attendees can see each other**.
3. Click **Save changes**.

**Limitations:**
- Seats can't be combined with recurring bookings or requiring confirmation.
- Booked seats can't be rescheduled; cancel the seat and book again instead.
- Team event types don't have seats.

## Recurring bookings

Let bookers reserve a series of meetings in one go (weekly or monthly).

1. In the editor, under **Advanced**, set **Recurring bookings** to **Invitees can book weekly repeats** or **Invitees can book monthly repeats**.
2. Set **Maximum occurrences** (2–52).
3. Click **Save changes**.

The booking form shows a **Number of occurrences** choice, from **Just this once** up to the maximum. The series starts at the time the booker picked.

**Limitations:** A recurring series can't be rescheduled as a whole; cancel one or all remaining occurrences instead. Team event types don't have recurring bookings.

## Require confirmation

New bookings stay pending until you accept them. Pending bookings keep their time blocked.

1. In the editor, under **Advanced**, tick **Requires confirmation**.
2. Optionally set **Only when the booking starts within (hours)**. Bookings that start later than that are confirmed right away. Leave it empty to always require confirmation.
3. Click **Save changes**.

You get an email with accept and reject links, and pending requests appear in **Bookings** → **Unconfirmed**. Click **Accept**, or **Reject…** and then **Reject booking**.

## Policies

These settings are under **Advanced**.

### Cancellation and rescheduling

1. Under **Booking policies**, set any of:
   - **Invitees can't cancel online** — hides self-service cancelling. This also turns off online rescheduling.
   - **Invitees can't reschedule online** — hides self-service rescheduling.
   - **No self-service changes within (hours of the start)** — invitees can't cancel or reschedule online within this many hours of the start.
2. Click **Save changes**.

### Redirect after booking

Send bookers to your own page after they book (e.g., a thank-you page).

1. Under **Advanced**, set **After booking, redirect to** to an https:// address.
2. Optionally tick **Add booking details to the redirect URL** to add uid, title, start, end, status, type, name and email as query parameters.
3. Click **Save changes**.

### Lock time zone

Show times in a fixed time zone, instead of the booker's own time zone.

1. Under **Booking policies**, set **Always show times in** to a time zone (e.g., `Europe/Istanbul`). Leave it empty to use the invitee's time zone.
2. Click **Save changes**.

### Custom event name

Change the booking's title, used in calendars and emails.

1. Under **Booking policies**, set **Event name in calendars**.
2. Use variables: `{event}` (event type title), `{host}` (host name), `{attendee}` (booker name), `{location}`. When empty, the name is `{event} between {host} and {attendee}`.
3. Example: `{attendee}'s {event} with {host}`.
4. Click **Save changes**.

## Single-use links

Create links that can each book this event type once.

1. Save the event type, then scroll to **Single-use links** in its editor.
2. Optionally set **Expires on (optional)**.
3. Click **Create link**.

Links are listed with their status (**Unused**, **Used** or **Expired**); click **Copy** to copy an unused link or **Delete** to remove it. To require such a link, tick **Only bookable with a single-use link** under **Advanced** and save. Single-use links are for personal event types only.

## Workflows and reminders

Automatically send emails when bookings change or before/after meetings (e.g., a reminder 24 hours before the meeting).

1. In the editor, scroll to **Workflows**.
2. Click **Add workflow**.
3. Enter a **Name** and choose **When**: **When a booking is confirmed**, **When a booking is cancelled**, **When a booking is rescheduled**, **Before the event starts** or **After the event ends**. For the last two, set **Minutes before** or **Minutes after**.
4. Choose **Send to**: **Me (the host)**, **Attendees**, or **A fixed email address**.
5. Enter the **Subject** and **Message**. You can use variables such as `{event_name}`, `{host_name}`, `{attendee_name}`, `{date}`, `{time}`, `{timezone}`, `{location}`, `{booking_url}`, `{cancel_url}` and `{reschedule_url}`; the full list is shown under the message.
6. Click **Save workflow**.

Each workflow can be switched **On** or off, edited or deleted. Every new event type starts with a "24-hour reminder" workflow sent to attendees. Times in the emails are shown in each recipient's time zone.

**Note:** Workflows are email-only (no SMS). If you change a workflow, already-scheduled reminders aren't moved; they re-check the booking but keep their original send time.

## Hidden event types

Hide an event type from your booking page but still allow bookings via its direct link.

1. In the editor, tick **Hide from my profile page (still bookable by direct link)**.
2. Click **Save changes**.

The event type won't appear on `/{username}` but is still bookable at `/{username}/{slug}`. Use single-use links for more control.
