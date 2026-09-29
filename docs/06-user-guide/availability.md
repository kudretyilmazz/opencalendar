# Availability

Control when people can book you by defining schedules and blocking off time when you're unavailable.

## Create or edit a schedule

A schedule is a set of weekly working hours in a specific time zone. You can have multiple schedules and assign them to different event types. Event types use your default schedule unless you pick another.

When you first open **Availability** (or create an event type), OpenCalendar creates a default schedule called "Working hours": Monday to Friday, 09:00–17:00, in your profile time zone.

### Add a new schedule

1. Click **Availability** → **New schedule**. A schedule named "New schedule" (Monday to Friday, 09:00–17:00, in your profile time zone) is created and opened.
2. Change the **Name** (e.g., "Summer office hours").
3. Set the **Time zone**.
4. Under **Weekly hours**, tick a day to make it available and set its start and end times. Click **Add hours** to add another time range to the same day.
5. Click **Save schedule**.

The new schedule can now be picked under **Availability schedule** when you edit an event type. If you don't pick one, the event type uses your **default** schedule.

### Edit an existing schedule

1. Click **Availability**.
2. Click the schedule's name or **Edit**.
3. Change the name, time zone, or weekly hours.
4. Click **Save schedule**.

Event types using this schedule use the new hours right away.

### Set the default schedule

Your default schedule is marked **Default** in the list. To make another schedule the default:

1. Click **Availability**.
2. Open a schedule that isn't the default.
3. Click **Make default**.

All event types without an explicit schedule use the default.

### Delete a schedule

Open a schedule that isn't the default and click **Delete**. Event types that used it fall back to your default schedule. The default schedule can't be deleted.

## Add a date override

Change your hours for specific dates (holidays, time off, events), or mark a date as unavailable.

1. Click **Availability** and open the schedule.
2. Under **Date overrides**, pick a date in **Add an override for** and click **Add override**. The date starts with 09:00–17:00.
3. Tick **Unavailable all day** to block the entire day, or change the time ranges.
4. Click **Save schedule**.

The override replaces the normal weekly hours for that day. You can add up to 400 overrides per schedule, with up to 10 time ranges each.

### Remove a date override

Click **Remove** next to the override, then click **Save schedule**.

## How availability is calculated

When someone views your booking page for an event type, they see start times within:

1. **Your working hours** — from the event type's schedule (or your default), including date overrides.
2. **Minus busy time**, including:
   - Your existing bookings (plus any buffer before/after).
   - Events on connected calendars that are set to check for conflicts.
   - Slot holds: a time someone has picked and is filling in the form for is held for 5 minutes.
3. **Constrained by event type settings**, like:
   - **Minimum notice** — how soon before the start a booking can be made.
   - **Bookable** — how far ahead people can book (a number of calendar or business days, a date range, or indefinitely).
   - **Start times every (minutes)** — the step between possible start times.
   - **Limit booking frequency** — max bookings per day/week/month/year.
   - **Limit total booked time** — max booked minutes per day/week/month/year.
   - **Seats per time slot** — a time disappears when all seats are taken.

If a month has no available times, the booking page says "No times available this month. Try the next month."

## Troubleshoot your availability

If no times are showing for an event type, use the troubleshooter to see why. There is no menu entry for it; open `/availability/troubleshoot` on your OpenCalendar instance.

1. Select an **Event type** and a **Date**. Team admins can also pick their teams' event types and a **Host**.
2. Click **Show**.

The table lists every possible start time on that day, its **Status**, and what it's **Because of** (for example the schedule, or the booking that blocks it).

Possible statuses:

- **Available** — the time can be booked (seated events show how many seats are left).
- **Outside your working hours** — Not in your schedule.
- **Date override** — A date override removes this time.
- **Too soon (minimum notice)** — Less than the required notice.
- **Outside the booking window** — Beyond how far ahead the event type can be booked.
- **Another booking** — Another booking takes this time.
- **Buffer around another booking** — The buffer before or after another booking.
- **Busy in a connected calendar** — An event on a connected calendar.
- **Held by someone filling in the form** — A slot hold is active.
- **Booking limit reached** — A booking frequency or total booked time limit is reached.
- **All seats taken** — Every seat of this time is booked.

If your schedule looks correct but times aren't showing, check:
1. Is the schedule's time zone the one you expect?
2. Are there unexpected date overrides or busy events on your calendar?
3. Does the event type's booking window reach far enough into the future?
