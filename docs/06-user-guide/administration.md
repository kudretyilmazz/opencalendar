# Administration

Instance administrators customize how OpenCalendar looks and who can use it. Open **Administration**
in the sidebar (under **Instance**); only administrators see it.

**Last updated:** 2026-10-01

## Who is an administrator

- The first account created on an instance becomes its administrator.
- Administrators can make other accounts administrators under **Users**.
- From the command line: `node cli.js create-admin <email>`.

## Overview

Shows the number of accounts, active administrators and disabled accounts, and the sign-up mode in
effect. Each tile links to the matching page.

## Users

Search accounts by name, email or username, and filter by role or status.

| Action | What happens |
|---|---|
| **Make admin** / **Remove admin** | Changes the role. The account is signed out so the change applies at once. |
| **Disable** | The account can't sign in, is signed out everywhere, and its booking pages stop taking bookings. |
| **Enable** | Undoes **Disable**. |
| **Delete…** | Cancels the account's upcoming bookings (invitees are notified) and deletes the account and its data permanently. Type the account's email to confirm. |

Two rules keep the instance manageable:

- You can't remove your own access (demote, disable or delete yourself). Ask another administrator.
- The last active administrator can't be demoted, disabled or deleted. Make someone else an
  administrator first.

## Branding

- **App name** replaces "OpenCalendar" in page titles, headers and emails.
- **Description** is used by search engines and link previews.
- **Footer**:
  - **Hide "Powered by OpenCalendar"** removes the attribution text.
  - **Hide the source code link** replaces the link with an **About** link. The `/about` page always
    offers the source code.
  - With both hidden, pages have no footer.
- **Logo and icons** are uploaded here and stored in the database. They take effect immediately;
  **Use default** removes an upload.

| Image | Formats | Max size |
|---|---|---|
| Logo, logo for dark mode | PNG, JPEG, WebP, SVG | 1 MB |
| Favicon | ICO, PNG, SVG | 256 KB |
| Home screen icon | PNG (180×180) | 256 KB |

> **License note.** OpenCalendar is licensed under the AGPL-3.0. If your server runs a modified
> version, section 13 requires you to offer its source code to everyone who uses it. Hiding the footer
> link is allowed because `/about` keeps the offer, but set the `SOURCE_URL` environment variable to
> your fork.

## Theme

- **Primary** colors buttons and focus rings; **Highlight** colors badges, links and progress. Set
  them separately for light and dark mode, or leave a field blank for the default.
- Text on these colors is chosen automatically for readability. A color too close to the page
  background is refused (it needs 3:1 contrast).
- **Corner radius** rounds buttons, inputs and cards.
- **Default color mode** applies to visitors who haven't picked one. Signed-in people keep their own
  setting.
- A team's brand color and an embed's `brand` parameter still win on their booking pages.

## Emails

- **Button color** for the call-to-action buttons (it needs 3:1 contrast with white).
- **Footer text** replaces the "Sent by …" line at the bottom of every email.
- Emails show the logo from **Branding** when it is a PNG, JPEG or WebP. Email apps don't display
  SVG, so an SVG logo is left out.

## Platform

- **Who can create an account**: **Server default** follows the `SIGNUP_MODE` environment variable;
  the other choices override it. The first account can always be created.
- **Hide "Continue with Google/Microsoft"** hides a configured sign-in button. To turn a provider off
  completely, remove its credentials from the server environment.
- **Home page headline and text**, and a **sign-in notice** shown above the sign-in and sign-up forms.
- **New account defaults**: time zone, first day of the week and time format for accounts created
  from now on. People can change them in their own settings.

Changes apply immediately on the server you saved them on, and within about 15 seconds on other
replicas.
