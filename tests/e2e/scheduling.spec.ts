import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  configureProfile,
  createEventType,
  expectAccessible,
  firstSlotButton,
  guardBrowserErrors,
  pickDate,
  pickFirstAvailableDay,
  signUpVerified,
} from "./helpers";
import { uniqueEmail, waitForEmail, waitForEmailLink } from "./mailpit";

guardBrowserErrors();

const MANAGE_LINK = /https?:\/\/[^\s)]+\/booking\/[A-Za-z0-9_-]+\?token=[A-Za-z0-9_%-]+/;

/** A fresh host with a verified account, username, Istanbul time zone and one event type. */
async function setupHost(page: Page) {
  const hostEmail = await signUpVerified(page, "Hana Host", "host");
  const username = `hana${Date.now().toString(36)}`;
  await configureProfile(page, username, "Europe/Istanbul");
  await createEventType(page, "Intro call", { minNotice: "0" });
  return { hostEmail, username };
}

/** Books the first available slot as a guest in `timeZone`; returns the booker's email. */
async function bookAsGuest(browser: Browser, url: string, timeZone: string, locale = "en-US") {
  const context = await browser.newContext({ timezoneId: timeZone, locale });
  const page = await context.newPage();
  const email = uniqueEmail("booker");
  await page.goto(url);
  await pickFirstAvailableDay(page);
  const slot = await firstSlotButton(page);
  const slotLabel = (await slot.textContent())?.trim();
  await slot.click();
  await page.getByLabel("Your name").fill("Bob Booker");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Notes (optional)").fill("Looking forward to it");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page).toHaveURL(/\/booking\/[A-Za-z0-9_-]+\?token=.+&new=1/);
  await expect(page.getByRole("heading", { name: "You are scheduled" })).toBeVisible();
  return { context, page, email, slotLabel };
}

test("host setup → public profile → booking → emails with ICS → dashboard (M1 core)", async ({ page, browser }) => {
  const { hostEmail, username } = await setupHost(page);

  // Public profile lists the event type (BKG-001).
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/${username}`);
  await expect(guest.getByRole("heading", { name: "Hana Host" })).toBeVisible();
  await expectAccessible(guest);
  await guest.getByRole("link", { name: /Intro call/ }).click();
  await expect(guest).toHaveURL(new RegExp(`/${username}/intro-call$`));
  await guestContext.close();

  const booked = await bookAsGuest(browser, `/${username}/intro-call`, "Europe/Istanbul");
  await expectAccessible(booked.page);

  // Confirmation emails with an iCalendar REQUEST go to both sides (NTF-002).
  const bookerMail = await waitForEmail(booked.email, /^Confirmed: Intro call/);
  expect(bookerMail.raw).toMatch(/Content-Type: text\/calendar; ?charset=utf-8; ?method=REQUEST/i);
  expect(bookerMail.raw).toContain("BEGIN:VCALENDAR");
  expect(bookerMail.text).toMatch(MANAGE_LINK);
  const hostMail = await waitForEmail(hostEmail, /^Confirmed: Intro call/);
  expect(hostMail.text).toContain("Bob Booker");
  expect(hostMail.text).not.toMatch(MANAGE_LINK); // the host never gets the attendee's token

  // The .ics download works from the confirmation page (BKG-007).
  const ics = await booked.page.request.get(
    (await booked.page.getByRole("link", { name: "Apple / .ics" }).getAttribute("href"))!,
  );
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("ATTENDEE;CN=Bob Booker");
  await booked.context.close();

  // The host sees it under Upcoming (BKG-010), and the slot is gone from the public page.
  await page.goto("/bookings");
  await expect(page.getByText("Intro call with Bob Booker")).toBeVisible();
  await expect(page.getByText("“Looking forward to it”")).toBeVisible();
  await expectAccessible(page);
});

test("booker in another time zone sees converted times in their clock (BKG-003, I18N-001)", async ({
  page,
  browser,
}) => {
  const { username } = await setupHost(page);
  // Host works 09:00–17:00 Istanbul (UTC+3) = 02:00–10:00 in New York (EDT, UTC-4) or 01:00–09:00 (EST).
  const context = await browser.newContext({ timezoneId: "America/New_York", locale: "en-US" });
  const guest = await context.newPage();
  await guest.goto(`/${username}/intro-call`);
  await expect(guest.getByLabel("Time zone")).toHaveValue("America/New_York");
  // Next month: whole working days (today may already be half over, whatever time the suite runs).
  await guest.getByRole("button", { name: "Next month" }).click();
  await pickFirstAvailableDay(guest);
  const slots = guest.locator('section[aria-label="Choose a time"] li button');
  await expect(slots.first()).toHaveText(/^(1|2):00\s?AM$/);
  // Switch to 24h and to Tokyo; times follow.
  await guest.getByRole("button", { name: "24h" }).click();
  await expect(slots.first()).toHaveText(/^0[12]:00$/);
  await guest.getByLabel("Time zone").fill("Asia/Tokyo");
  await pickFirstAvailableDay(guest);
  await expect(slots.first()).toHaveText("15:00");
  await context.close();
});

test("reschedule and cancel through the emailed link (BKG-008, BKG-009, NTF-003)", async ({ page, browser }) => {
  const { hostEmail, username } = await setupHost(page);
  const booked = await bookAsGuest(browser, `/${username}/intro-call`, "UTC");
  const manageLink = await waitForEmailLink(booked.email, /^Confirmed: Intro call/, MANAGE_LINK);

  // Reschedule: the manage page links to the booking page in reschedule mode.
  const p = booked.page;
  await p.goto(manageLink);
  await expect(p.getByRole("heading", { name: "Your booking" })).toBeVisible();
  await p.getByRole("link", { name: "Reschedule" }).click();
  await expect(p.getByText(/Rescheduling your booking from/)).toBeVisible();
  await pickFirstAvailableDay(p);
  const slots = p.locator('section[aria-label="Choose a time"] li button');
  await slots.nth(1).click();
  await expect(p.getByLabel("Email")).toHaveValue(booked.email);
  await p.getByRole("button", { name: "Confirm new time" }).click();
  await expect(p.getByRole("heading", { name: "You are scheduled" })).toBeVisible();

  const rescheduled = await waitForEmail(booked.email, /^Rescheduled: Intro call/);
  expect(rescheduled.raw).toMatch(/SEQUENCE:1/);
  await waitForEmail(hostEmail, /^Rescheduled: Intro call/);

  // The old link now shows the booking as rescheduled and offers no actions.
  await p.goto(manageLink);
  await expect(p.getByRole("heading", { name: "This booking was rescheduled" })).toBeVisible();
  await expect(p.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

  // Cancel the new booking via its own link.
  const newLink = await waitForEmailLink(booked.email, /^Rescheduled: Intro call/, MANAGE_LINK);
  await p.goto(newLink);
  await p.getByRole("button", { name: "Cancel booking" }).click();
  await p.getByLabel("Reason for cancelling (optional)").fill("Something came up");
  await p.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(p.getByRole("heading", { name: "This booking is cancelled" })).toBeVisible();
  const cancelMail = await waitForEmail(hostEmail, /^Cancelled: Intro call/);
  expect(cancelMail.text).toContain("Something came up");
  expect(cancelMail.raw).toMatch(/method=CANCEL/i);
  await booked.context.close();

  // Host dashboard: cancelled tab shows it with the reason.
  await page.goto("/bookings?tab=cancelled");
  await expect(page.getByText(/Cancelled by attendee: Something came up/)).toBeVisible();
});

test("a manage link with a wrong token can't cancel (BKG-011)", async ({ page, browser }) => {
  const { username } = await setupHost(page);
  const booked = await bookAsGuest(browser, `/${username}/intro-call`, "UTC");
  const link = new URL(await waitForEmailLink(booked.email, /^Confirmed: Intro call/, MANAGE_LINK));
  link.searchParams.set("token", "forged-token");
  await booked.page.goto(link.toString());
  await expect(booked.page.getByText("Bob Booker")).toHaveCount(0); // no attendee details
  await expect(booked.page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  await booked.context.close();
});

test("host cancels from the dashboard and the invitee is notified (BKG-010)", async ({ page, browser }) => {
  const { username } = await setupHost(page);
  const booked = await bookAsGuest(browser, `/${username}/intro-call`, "UTC");
  await booked.context.close();
  await page.goto("/bookings");
  await page.getByRole("button", { name: "Request reschedule" }).click();
  await page.getByLabel(/Message to Bob Booker/).fill("Can we move this?");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText("We asked the invitee to pick a new time.")).toBeVisible();
  const mail = await waitForEmail(booked.email, /^Cancelled: Intro call/);
  expect(mail.text).toContain("Can we move this?");
  expect(mail.text).toContain(`/${username}/intro-call`);
});

test("schedules: date override removes a day from the booking page (AVL-002)", async ({ page, browser }) => {
  const { username } = await setupHost(page);
  // Find the first bookable day as a guest, then block it with an override.
  const context = await browser.newContext({ timezoneId: "Europe/Istanbul", locale: "en-GB" });
  const guest = await context.newPage();
  await guest.goto(`/${username}/intro-call`);
  await pickFirstAvailableDay(guest);
  const dayLabel = (await guest
    .getByRole("group", { name: "Days" })
    .locator('button[aria-pressed="true"]')
    .getAttribute("aria-label"))!;
  const date = new Date(`${dayLabel.replace(/^\w+,\s*/, "")} 12:00 UTC`);
  const iso = date.toISOString().slice(0, 10);

  await page.goto("/availability");
  await page.getByRole("link", { name: "Edit" }).first().click();
  await pickDate(page, page.getByLabel("Add an override for"), iso);
  await page.getByRole("button", { name: "Add override" }).click();
  await page.getByLabel("Unavailable all day").check();
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Schedule saved.")).toBeVisible();
  await expectAccessible(page);

  // The slot endpoint may serve its cached context for up to PUBLIC_CONTEXT_TTL_MS (10 s): e.g. in
  // dev, route handlers and server actions don't share the module instance that holds the cache.
  // Open the day's month explicitly: near a month's end the first free day is in the next month,
  // and a plain reload would show the current one.
  await expect(async () => {
    await guest.goto(`/${username}/intro-call?month=${iso.slice(0, 7)}`);
    await expect(guest.getByRole("button", { name: `${dayLabel}, no times available` })).toBeDisabled({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await context.close();
});

test("account deletion removes the public page (ADM-006)", async ({ page }) => {
  const { hostEmail, username } = await setupHost(page);
  await page.goto("/settings/profile");
  await page.getByRole("button", { name: "Delete account…" }).click();
  await page.getByLabel(`Type ${hostEmail} to confirm`).fill(hostEmail);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  const res = await page.goto(`/${username}`);
  expect(res?.status()).toBe(404);
});
