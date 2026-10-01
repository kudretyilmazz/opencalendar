import { expect, type Page, test } from "@playwright/test";
import { configureProfile, expectAccessible, firstSlotButton, guardBrowserErrors, pickFirstAvailableDay, pickOption, signUpVerified } from "./helpers";
import { uniqueEmail, waitForEmail } from "./mailpit";

/**
 * M4 teams end to end (critical flow 7): create a team, invite a member who accepts (TEAM-001/002),
 * create a round-robin event type with weighted/prioritised hosts (TEAM-005/006), and check each
 * booking lands on the right host. Also the team availability view (TEAM-010).
 */

guardBrowserErrors();

async function book(page: Page, path: string, name: string) {
  await page.goto(path);
  await pickFirstAvailableDay(page);
  await (await firstSlotButton(page)).click();
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, ""));
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are scheduled" })).toBeVisible();
  return email;
}

test("round robin assigns each booking to the correct host (flow 7)", async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  const memberEmail = await signUpVerified(member, "Rui Robin", "rrmember");

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUpVerified(owner, "Olga Owner", "rrowner");
  await configureProfile(owner, `olga${stamp}`, "UTC");

  // Team (TEAM-001)
  await owner.goto("/teams");
  await owner.getByLabel("Team name").fill(`Robin ${stamp}`);
  await owner.getByRole("button", { name: "Create team" }).click();
  await expect(owner).toHaveURL(/\/teams\/[^/]+$/);
  const teamPath = new URL(owner.url()).pathname;
  const teamSlug = `robin-${stamp}`;
  await expectAccessible(owner);

  // Invitation (TEAM-002): the member accepts with their verified email.
  await owner.getByLabel("Email", { exact: true }).fill(memberEmail);
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText(`Invitation sent to ${memberEmail}.`)).toBeVisible();
  await waitForEmail(memberEmail, /invited you to Robin/);
  await member.goto("/teams");
  await member.getByRole("button", { name: `Accept invitation to Robin ${stamp}` }).click();
  await expect(member).toHaveURL(new RegExp(`${teamPath}$`));

  // Round-robin event type with both hosts; the member has the higher priority (TEAM-006).
  await owner.goto(`${teamPath}/event-types/new?type=round_robin`);
  await owner.getByLabel("Title").fill("Team intro");
  await owner.getByLabel("Minimum notice", { exact: true }).fill("0");
  await owner.getByRole("button", { name: "Create event type" }).click();
  await expect(owner.getByRole("heading", { name: "Team intro" })).toBeVisible();
  await owner.getByLabel("Olga Owner").check();
  await owner.getByLabel("Rui Robin").check();
  await pickOption(owner, owner.getByLabel("Priority for Rui Robin"), "highest");
  await owner.getByRole("button", { name: "Save hosts" }).click();
  await expect(owner.getByText("Hosts saved.")).toBeVisible();
  await expectAccessible(owner);

  // Public team page lists it (TEAM-001).
  const guestContext = await browser.newContext({ timezoneId: "UTC" });
  const guest = await guestContext.newPage();
  await guest.goto(`/team/${teamSlug}`);
  await expect(guest.getByRole("heading", { name: `Robin ${stamp}` })).toBeVisible();
  await expect(guest.getByRole("link", { name: /Team intro/ })).toBeVisible();
  await expectAccessible(guest);

  // 1st booking: tie on load → priority → Rui.
  const firstEmail = await book(guest, `/team/${teamSlug}/team-intro`, "First Guest");
  await expect(guest.getByText("Rui Robin", { exact: true })).toBeVisible();
  await expectAccessible(guest);

  // Rescheduling from the confirmation page opens the team's booking page, not the host's (BKG-009).
  const reschedule = guest.getByRole("link", { name: "Reschedule" });
  await expect(reschedule).toHaveAttribute("href", new RegExp(`^/team/${teamSlug}/team-intro\\?reschedule=`));
  await reschedule.click();
  await expect(guest.getByText(/Rescheduling your booking from/)).toBeVisible();
  await waitForEmail(firstEmail, /^Confirmed: Team intro/);
  await waitForEmail(memberEmail, /^Confirmed: Team intro/);

  // 2nd booking of the same earliest slot: Rui is busy then, so Olga gets it.
  await book(guest, `/team/${teamSlug}/team-intro`, "Second Guest");
  await expect(guest.getByText("Olga Owner", { exact: true })).toBeVisible();

  // After cancelling, "Book again" also points at the team's booking page.
  await guest.getByRole("button", { name: "Cancel booking" }).click();
  await guest.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(guest.getByRole("heading", { name: "This booking is cancelled" })).toBeVisible();
  await expect(guest.getByRole("link", { name: "Book again" })).toHaveAttribute("href", `/team/${teamSlug}/team-intro`);

  // The assignment reason is on the host's dashboard; the availability view shows both members.
  await member.goto("/bookings");
  await expect(member.getByText("First Guest").first()).toBeVisible();
  // Team bookings carry the team's badge, and the team filter separates them from personal ones.
  await expect(member.getByText(`Team: Robin ${stamp}`).first()).toBeAttached();
  await pickOption(member, member.getByLabel("Team", { exact: true }), "Personal only");
  await expect(member).toHaveURL(/team=personal/);
  await expect(member.getByText("First Guest")).toHaveCount(0);
  await pickOption(member, member.getByLabel("Team", { exact: true }), `Robin ${stamp}`);
  await expect(member.getByText("First Guest").first()).toBeVisible();
  await expectAccessible(member);
  await owner.goto(`${teamPath}/availability`);
  await expect(owner.getByRole("rowheader", { name: /Rui Robin/ })).toBeVisible();
  await expect(owner.getByRole("rowheader", { name: /Olga Owner/ })).toBeVisible();
  await expectAccessible(owner);

  // A new collective event type starts without hosts: both pages warn until hosts are set; "assign
  // all team members" fixes it for everyone, including people who join later.
  await owner.goto(`${teamPath}/event-types/new?type=collective`);
  await owner.getByLabel("Title").fill("All hands");
  await owner.getByRole("button", { name: "Create event type" }).click();
  await expect(owner.getByRole("heading", { name: "All hands" })).toBeVisible();
  await expect(owner.getByText(/No hosts yet, so the booking page shows no times/)).toBeVisible();
  await owner.goto(teamPath);
  await expect(owner.getByText("No hosts · no times offered")).toBeVisible();
  await owner.getByRole("link", { name: "All hands" }).click();
  await owner.getByRole("switch", { name: "Assign all team members" }).click();
  await expect(owner.getByLabel("Rui Robin")).toBeChecked();
  await expect(owner.getByLabel("Rui Robin")).toBeDisabled();
  await owner.getByRole("button", { name: "Save hosts" }).click();
  await expect(owner.getByText("Hosts saved.")).toBeVisible();
  await expect(owner.getByText(/No hosts yet/)).toHaveCount(0);
  await expectAccessible(owner);
  await owner.goto(teamPath);
  await expect(owner.getByText("No hosts · no times offered")).toHaveCount(0);
  await expect(owner.getByText("All team members")).toBeVisible();

  await Promise.all([guestContext.close(), ownerContext.close(), memberContext.close()]);
});
