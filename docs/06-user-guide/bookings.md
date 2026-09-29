# Bookings

Manage bookings from both sides: the booker's scheduling flow and your host dashboard.

## The booker's flow

A person visiting your booking page goes through this flow:

1. **Pick an event type** — From your public profile at `/{username}`.
2. **Choose a date** — The calendar shows one month; days with at least one available time can be clicked.
3. **Choose a time** — Times are shown in the booker's detected time zone. They can change it in the **Time zone** field and switch between **12h** and **24h**.
4. **See the event details** — Your name, the event title, duration, locations and description are shown next to the calendar.
5. **Fill in the form** — Their name and email, optionally guests (up to the event type's limit) and notes, and answers to any booking questions you configured. Then they click **Confirm booking** (or **Request booking** if the event type requires confirmation).
6. **Confirmation page** — After booking, they see "You are scheduled" (or "Waiting for the host to confirm") with:
   - The date and time in their time zone.
   - **Add to calendar** links: **Google**, **Outlook** and **Apple / .ics**.
   - **Reschedule** and **Cancel booking** buttons, when allowed by the event type.

The booker, their guests and you receive a confirmation email with a calendar invitation (.ics). The booker's email contains their personal manage link.

## Your booking dashboard

View, manage, and respond to all bookings.

### Access your bookings

Click **Bookings** in the menu. Times are shown in your time zone.

### Booking tabs

- **Upcoming** — Confirmed bookings that haven't ended yet. You can cancel them or ask the invitee to pick a new time.
- **Unconfirmed** — Pending booking requests waiting for your approval (if you turned on **Requires confirmation**). Accept or reject them here.
- **Past** — Bookings that have ended. Mark no-shows if needed.
- **Cancelled** — Cancelled, rejected and rescheduled bookings.

### Filter bookings

Use the filters at the top to narrow down:
- **Event type** — Show only bookings for a specific event type.
- **From** / **To** — Show bookings in a date range.

Click **Filter** to apply.

### Booking details

Each booking card shows:
- Date and start and end time.
- The event title, the attendee's name and email, and any guests.
- Their notes and answers to your booking questions.
- "Part of a recurring series", for recurring bookings.
- The meeting location.
- "Calendar sync failed for this booking", if the booking couldn't be written to your calendar.
- Who cancelled it and why, or that it was rescheduled or rejected.

## Manage upcoming bookings

For bookings in the **Upcoming** tab:

- **Cancel** — Enter a reason (sent to the attendee) and click **Cancel booking**. The booking is cancelled and the attendee is notified by email.
- **Request reschedule** — Optionally enter a message and click **Send request**. The booking is cancelled and the attendee gets an email with a link to book a new time.

## Approve or reject pending bookings

If you turned on **Requires confirmation** on an event type, new booking requests appear in the **Unconfirmed** tab. You also get an email with accept and reject links.

- Click **Accept** to confirm the booking.
- Click **Reject…**, optionally enter a **Reason (sent to the invitee, optional)**, and click **Reject booking**.

The attendee gets an email with your decision. If accepted, they receive the calendar invitation.

## Mark a no-show

For confirmed bookings in the **Past** tab, mark attendees or yourself as a no-show.

1. Open the **Past** tab.
2. Under **No-show**, tick **You (host)** or the attendee who didn't show up.

The change is saved right away. Untick to undo it.

## The booker's manage link

After booking, the attendee receives an email with their manage link. It opens the booking's page, where they can:

- **View booking details** — What, when, host, invitees and location.
- **Reschedule** — Pick a new time. The original booking is shown as rescheduled and a new booking is created.
- **Cancel booking** — With an optional reason. For a pending request the button is **Withdraw request**.
- **Add to calendar** — Google, Outlook or an .ics file.

If you turned off online cancelling or rescheduling on the event type, those buttons are hidden. Turning off cancelling also hides rescheduling. Within the **No self-service changes within (hours of the start)** period, the page says the booking can't be changed online anymore.

## Recurring bookings

If a booker booked a recurring series, all occurrences are linked and shown as "Part of a recurring series" in your dashboard.

- From their manage link, the booker can cancel **Only this occurrence** or **This and all remaining occurrences**.
- You cancel occurrences one by one from **Bookings**.

**Limitation:** A recurring series can't be rescheduled as a whole; cancel one or all remaining occurrences and book again instead.

## Seated bookings (group events)

If you turned on seats for an event type:
- Each seat holder gets their own manage link.
- They see only their own details unless you ticked **Attendees can see each other**.
- **Cancel my seat** frees the seat for others; the event goes on for everyone else.

**Limitation:** Seated bookings can't be rescheduled; the booker must cancel their seat and book again.

## Calendar sync

When you have a destination calendar, each confirmed booking is written to it as an event with:
- The attendee(s).
- The meeting location or video link.

If a booking is rescheduled, the calendar event is updated. If it's cancelled, the event is deleted.

If a booking couldn't be written to your calendar, its card says "Calendar sync failed for this booking". If a calendar connection stops working, a banner at the top of the dashboard asks you to reconnect it.

## Notifications and emails

- **Confirmation email** — The booker, their guests and you get it, with a calendar invitation (.ics).
- **Booking request email** — If the event type requires confirmation, the booker is told the request is waiting, and you get accept and reject links.
- **Decision email** — When you accept, the booker gets the confirmation with the calendar invitation. When you reject, they get a rejection email with your reason, if you gave one.
- **Cancellation email** — Sent when a booking is cancelled (by you or the attendee), with a calendar cancellation (.ics). When you use **Request reschedule**, it includes a link to book a new time.
- **Reminders and other automatic emails** — Sent by the event type's [workflows](./event-types.md#workflows-and-reminders). Every new event type has a 24-hour reminder to attendees.
