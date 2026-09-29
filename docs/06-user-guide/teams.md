# Teams

Work with colleagues on shared event types, workflows, webhooks and routing forms.

## Create a team

1. Click **Teams** in the menu.
2. Go to **Create a team**.
3. Enter a **Team name** (e.g., "Sales team").
4. Check the **Team URL** (e.g., `sales`); it's filled in from the name. It creates a public team page at `/team/sales`.
5. Click **Create team**.

You're now the team's **owner**. After creating the team, you can add a **Logo URL** (https:// only) and a **Brand color** (hex code like #2563eb) under **Settings** on the team page. The logo is shown on the public team page, and the brand color is used on the team's booking pages.

## Invite team members

1. Click **Teams** → your team name.
2. Under **Members**, go to **Invite someone**.
3. Enter the member's **Email** and choose a **Role** (owner, admin or member).
4. Click **Send invitation**.

They receive an email with a link. They sign in (or create an account) with the invited email address and click **Accept** or **Decline** under **Invitations** on their **Teams** page. Invitations expire after 14 days. Pending invitations are listed on the team page, where you can **Cancel** them.

## Roles and permissions

Teams have three roles:

### Owner
- Everything an admin can do.
- Invite owners, make members owners, and change or remove other owners.
- Delete the team (not possible while it has upcoming bookings).

A team always keeps at least one owner.

### Admin
- Invite members and admins.
- Switch members between member and admin, and remove members and admins.
- Create, edit, turn off and delete team event types.
- Manage team workflows, team webhooks and team routing forms.
- Edit the team's name, URL, logo and brand color.

### Member
- See the team's members and event types.
- See the team availability view.
- Leave the team.

Members work with managed event types through their own personal copies (see [Managed](#managed)).

## Event type scheduling types

Admins create team event types from the team page with **New collective**, **New round robin** or **New managed**. Each kind changes how availability is calculated.

### Collective

All hosts attend each booking. A time is offered only when all of them are free.

**Use case:** Team calls where all members must attend.

**How it works:**
1. On the team page, click **New collective** and set up the event type.
2. Under **Hosts**, tick the members who attend and click **Save hosts**.
3. A time is available only when every host is free.

### Round robin

Each booking goes to one free host from the pool. Bookers see a time if any pool host is free.

**Use case:** Support queue, sales demos (rotate fairly).

**How it works:**
1. On the team page, click **New round robin**.
2. Under **Hosts**, tick the members in the pool. For each, set a **Weight** (their share of bookings) and a **Priority** (lowest, low, medium, high, highest).
3. Set **Balance over the last (days)** (default 30): bookings in this period count when balancing.
4. Optionally tick **Fixed** for hosts who attend every booking in addition to the rotating host.
5. Click **Save hosts**.

**Example:** Three hosts with weights 1, 2 and 3. Over 60 bookings, host 1 gets about 10, host 2 about 20, and host 3 about 30.

The host is picked by weighted load first; **Priority** breaks ties between equally loaded hosts (higher priority wins), then fewer recent bookings.

**Limitation:** Team event types have no per-type schedule; each host uses their own default schedule.

### Managed

A template that is copied to each assigned member. Admins decide which fields members can't change.

**Use case:** Standardized event types across the team.

**How it works:**
1. On the team page, click **New managed** and set up the template.
2. Under **Assignment and locked fields**, tick the **Assigned members**.
3. Under **Locked fields**, tick what always follows the template: Title, description and event name; Durations; Locations; Booking questions; Buffers, notice and booking window; Limits and guests; Requires confirmation; Cancellation and redirect policies.
4. Click **Save assignments**.
5. Each assigned member gets their own copy among their personal event types, at their own URL with the template's slug. Members can change the unlocked settings; changes to locked settings are ignored.

When you update the template, the locked fields are pushed to all copies.

**Limitation:** Team event types have no seats, recurring series, or single-use links (these are personal-only features).

## Dynamic group links

Let people book several colleagues together without a team event type. For example, `/alice+bob/intro` lets visitors book Alice's "intro" event type with both Alice and Bob attending.

Everyone in the link must be in a shared team and have opted in:

1. Each person goes to **Settings**.
2. Ticks **Allow group links with teammates**.
3. Clicks **Save settings**.

Now visitors can open `/alice+bob` to see the first person's event types and book them with everyone, each on their default schedule. A group link can have up to 5 people. Event types with seats, recurring bookings or single-use links can't be booked as a group.

## Team availability view

See at a glance when team members are available.

1. Click **Teams** → **Availability** next to your team (or **Team availability** on the team page).
2. View each member's working hours (from their default schedule) and busy blocks (from bookings and connected calendars), in your time zone.
3. Switch between **Day** and **Week**, and use **← Previous** and **Next →**.

This view shows busy time only, not meeting details.

## Team workflows and reminders

Send automated emails for every event type of your team (e.g., a reminder 24 hours before the meeting). Team workflows are managed by admins and owners.

1. Click **Teams** → your team name.
2. Go to **Workflows**.
3. Click **Add workflow**.
4. Choose **When**, **Send to**, and for timed workflows the minutes before or after.
5. Enter the **Subject** and **Message** (template variables are listed under the message).
6. Click **Save workflow**.

Every new team starts with a "24-hour reminder" workflow sent to attendees. See [Workflows and reminders](./event-types.md#workflows-and-reminders) for all options.

## Remove a team member

1. Click **Teams** → your team name.
2. Under **Members**, find the member and choose **Their future team bookings**:
   - **Reassign to other hosts** — A round-robin booking goes to another pool host who is free at that time; a collective booking continues without them. If nobody is free, the booking is cancelled.
   - **Cancel them** — Their future team bookings are cancelled and the attendees are emailed.
3. Click **Remove**.

Members can leave a team themselves with **Leave team**.

## Public team page

Your team page at `/team/{slug}` shows:
- The team name and logo.
- All collective and round-robin event types that are turned on and not hidden.

It works just like a personal profile, but for the team. Managed event types are booked through each member's own copy instead.

## Team settings

From the team page, admins and owners can:
- Edit the **Team name**, **Team URL**, **Logo URL** and **Brand color** under **Settings**, then click **Save team**.
- Manage **Members** (invite, remove, change roles).
- Create team event types and turn them on or off.
- Manage team **Workflows** and **Webhooks**.
- Open the **Public page ↗**.

Owners can also delete the team under **Delete team**. This deletes the team, its event types and routing forms, and isn't possible while there are upcoming bookings.

Team routing forms are created from **Routing forms** by choosing the team as **Owner** (see [Routing forms](./routing-forms.md)).

## Member removal details

When a member is removed:
- Their personal event types are unaffected.
- Their future bookings of the team's event types are reassigned or cancelled, as chosen.
- Pending booking requests change hands quietly: the new host finds them under **Unconfirmed**, and the attendee isn't emailed.
- Reassigned confirmed meetings email the attendees and hosts and move the calendar event.
- When a collective co-host leaves, the meeting continues without them and nobody is emailed.
