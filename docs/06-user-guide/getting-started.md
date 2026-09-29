# Getting Started

Set up your account and publish your booking page in a few minutes.

## Sign up

1. On the sign-in page, click **Sign up** (next to "No account?").
2. Enter your **Name**, **Email** and **Password** (at least 10 characters). If your administrator has set them up, you can instead click **Continue with Google** or **Continue with Microsoft**.
3. Click **Create account**.

Some instances are invite-only or have sign-ups turned off. In that case the sign-up page says **Sign-ups are closed**. On an invite-only instance, ask a team on it to invite your email address; then open the sign-in page, choose **Sign in with an email link instead**, enter the invited address and click **Email me a sign-in link** — the link creates your account.

## Verify your email

After signing up with email and password you see **Check your email**. Open the email and click the verification link (it expires in 24 hours). You can't sign in with your password until your email is verified.

If you don't see the email, check your spam folder. If you try to sign in before verifying, a new verification link is sent to you.

## Sign in

On the sign-in page, enter your **Email** and **Password** and click **Sign in**. You can also:

- Click **Sign in with an email link instead** and then **Email me a sign-in link**. The link expires in 15 minutes.
- Click **Forgot your password?** to get a reset link by email. It expires in 60 minutes.

## Publish your booking page

To let people book you, you need a verified email address, a username and at least one event type that is turned on. The **Home** page shows a **Getting started** checklist with these steps.

### Set your username

1. Click **Settings**.
2. Enter a **Username** (3–32 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen). For example, `alice` gives you a booking page at `/alice`. Some names, such as `admin` or `settings`, are reserved.
3. Set your **Time zone**.
4. Click **Save settings**.

Your public page is now at `/{username}`. The **Event types** page shows the link under **Your booking page**.

You can also set your **Name**, which is shown on your booking page and in emails.

### Time zone and display preferences

In **Settings**, you can also adjust:
- **Time zone** — your local time. Used for your dashboard, for new schedules and in your emails.
- **Language** — English or Türkçe. Used to format dates and times.
- **Week starts on** — Sunday, Monday, or Saturday.
- **Time format** — 24-hour (14:30) or 12-hour (2:30 PM).
- **Theme** — System, Light, or Dark.

People who book you see times in their own time zone, unless the event type always shows times in a fixed zone (see [Event types → Always show times in](./event-types.md#lock-time-zone)).

### Allow group links with teammates

To let people book you together with members of your teams (e.g., `/you+colleague`), check **Allow group links with teammates** in **Settings** and click **Save settings**. Everyone in the link must share a team and have this turned on. See [Teams → Dynamic group links](./teams.md#dynamic-group-links) for details.

## Create your first event type

1. Click **Event types** → **New event type**.
2. Enter a **Title** (e.g., "30-minute intro call"). The **URL** is filled in from the title.
3. Set the **Default duration (minutes)** (5–720, default 30).
4. Optionally add a location under **Add a location**: in person, a phone call, a custom meeting link, Jitsi Meet, Google Meet, Microsoft Teams or Zoom.
5. Click **Create event type**.

Once your email is verified and you have a username, the event type is bookable at `/{username}/{slug}`.

## Next steps

- [Set your availability](./availability.md) — Define your working hours so people know when they can book you.
- [Configure event type details](./event-types.md) — Add buffers, minimum notice, booking limits, booking questions, and more.
- [Connect your calendar](./calendars.md) — Block your availability when you have other commitments.
- [Invite a team](./teams.md) — Work with colleagues on shared event types.

## Manage your account

### Change your password

There is no password change screen yet. Sign out, click **Forgot your password?** on the sign-in page and follow the emailed link. Resetting your password signs you out everywhere.

### Delete your account

1. Click **Settings**.
2. Scroll to **Delete account** at the bottom.
3. Type your email address to confirm and click **Delete my account**.

Deleting your account cancels your upcoming bookings (invitees are notified) and permanently deletes your account, schedules, event types and bookings. This cannot be undone.
