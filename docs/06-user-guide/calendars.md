# Calendars

Connect your calendars to block your availability and automatically add bookings to your calendar.

## Why connect a calendar?

- **Conflict detection** — Events on your calendars are treated as busy, so people can't book you at those times.
- **Automatic booking sync** — New bookings are added to your destination calendar as events.
- **Video link generation** — With Google Meet or Microsoft Teams as an event type's location, the meeting link is created on your destination calendar.

All of this is on the **Calendars** page in the menu.

## Connect Google Calendar

1. Click **Calendars**.
2. Under **Connect an account**, click **Connect Google Calendar**.
3. Sign in to your Google account and grant permissions.
4. You're redirected back to OpenCalendar and see "Connected." Your Google calendars now appear.

The **Connect** buttons only appear for providers your administrator has set up.

### Use Google Calendar features

- Choose which Google calendars to check for conflicts (by default, your primary calendar).
- Make one your destination calendar (where new bookings are added).
- Use Google Meet: meeting links are created per booking when Google Meet is the location and your destination calendar is a Google calendar.

## Connect Microsoft 365 / Outlook

1. Click **Calendars**.
2. Under **Connect an account**, click **Connect Microsoft 365 / Outlook**.
3. Sign in to your Microsoft account and grant permissions.
4. You're redirected back. Your Microsoft calendars now appear.

### Use Microsoft 365 features

- Choose which calendars to check for conflicts.
- Make one your destination calendar.
- Use Microsoft Teams: meeting links are created when Microsoft Teams is the location and your destination calendar is a Microsoft calendar.

## Connect Zoom

Under **Connect an account**, click **Connect Zoom** and sign in. Zoom has no calendars; it's used to create a Zoom link for every booking of event types with Zoom as a location.

## Connect CalDAV (iCloud, Fastmail, Nextcloud)

1. Click **Calendars**.
2. Go to **CalDAV (iCloud, Fastmail, Nextcloud…)**.
3. Choose a **Provider**: iCloud, Fastmail, Nextcloud, or Other CalDAV server. The **Server URL** is filled in for you (for Nextcloud and other servers, enter your own).
4. Enter your **Username** and **Password**. Use an app-specific password where your provider offers one.
5. Click **Connect CalDAV**.

Your CalDAV calendars now appear. All of them are checked for conflicts by default.

**Note:** Google Meet and Microsoft Teams links need a Google or Microsoft destination calendar. Jitsi Meet, Zoom and custom links work with any calendar.

## Subscribe to an ICS feed

Read events from a read-only calendar feed (e.g., a public holiday calendar or a team events feed).

1. Click **Calendars**.
2. Go to **Calendar feed**.
3. Enter the **Calendar feed URL (.ics)** (`https://…` or `webcal://…`).
4. Click **Add feed**.

Events from the feed block your availability like other calendar events. Nothing is written back to the feed.

## Manage connected calendars

Each connected account shows:

- **Provider** — e.g., Google Calendar, Microsoft 365 / Outlook, CalDAV, or ICS feed (read-only).
- **Account** — The email or account name.
- **Calendars** — The calendars in that account, each with its color.

### Per-calendar options

For each calendar:

- **Check conflicts** — Click to make this calendar block your availability. When it's on, the button reads **✓ Checks conflicts**; click it again to turn it off.
- **Use for new bookings** — Make this calendar your destination calendar (where bookings are added). You have one destination calendar in total.

The **read-only** badge marks calendars that can't receive bookings (such as ICS feeds). The **destination** badge marks the calendar that receives new bookings.

### Per event type

When you have connected calendars, the event type editor has a **Calendars** section:

- **Check these calendars for conflicts** — pick specific calendars for this event type (none selected = your account defaults).
- **Add new bookings to** — a different destination calendar for this event type, or **My default destination calendar**.

## Reconnect a broken calendar

If a connection stops working (e.g., password changed, access revoked), the account shows "This connection stopped working", and a banner at the top of the dashboard says "A calendar connection needs attention."

To fix it:

1. For **Google, Microsoft, or Zoom**, click **Reconnect** and sign in again.
2. For **CalDAV** and ICS feeds, click **Disconnect** and connect again with updated details.

Until you reconnect, bookings still work, but OpenCalendar can't check this calendar for conflicts or add bookings to it.

## Set a destination calendar

New bookings are added to your destination calendar as events. When you connect your first writable calendar, OpenCalendar picks one automatically (the primary calendar if there is one).

1. Click **Calendars**.
2. Find the calendar you want to use.
3. Click **Use for new bookings**.

You have one destination calendar. To send a specific event type's bookings elsewhere, use **Add new bookings to** in that event type.

## Sync and conflicts

### How conflict detection works

When people view your booking page, OpenCalendar reads busy times from all calendars that check conflicts. To stay fast, results are cached: Google and Microsoft calendars are re-read at least every 2 minutes, CalDAV calendars and ICS feeds every 5 minutes by default. Just before a booking is made, the times are re-checked with data at most 30 seconds old.

### How booking sync works

When a booking is confirmed:
1. OpenCalendar creates an event on your destination calendar.
2. The attendees are added to the event.
3. The meeting location or video link is included.
4. If the booking is rescheduled, the calendar event is updated.
5. If the booking is cancelled, the calendar event is deleted.

**For team event types:** The event is written to the organizer's destination calendar only. Collective co-hosts are attendees of that event and get the calendar invitation by email; nothing is written to their own calendars.

If sync fails, the booking's card in **Bookings** says "Calendar sync failed for this booking".

## Disconnect a calendar

1. Click **Calendars**.
2. Find the account and click **Disconnect**.

The account and its calendars are removed. If it held your destination calendar, another connected writable calendar becomes the destination, if you have one. Event types that sent bookings to one of its calendars go back to your default destination calendar.
