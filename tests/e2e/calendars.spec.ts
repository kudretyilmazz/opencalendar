import { createServer, type Server } from "node:http";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { configureProfile, createEventType, guardBrowserErrors, signUpVerified } from "./helpers";
import { uniqueEmail, waitForEmail } from "./mailpit";

/**
 * M2 flows against a real CalDAV server (Radicale from docker-compose.dev.yml, or the URL in
 * E2E_CALDAV_URL) and a local ICS feed. Google/Microsoft/Zoom need real OAuth apps and are
 * covered by contract and integration tests instead.
 */

guardBrowserErrors();

const CALDAV = process.env.E2E_CALDAV_URL ?? "http://localhost:5232";
/** How the app reaches this machine (differs when the app runs in a container). */
const HOST_FROM_APP = process.env.E2E_HOST_FROM_APP ?? "localhost";
const CALDAV_FROM_APP = process.env.E2E_CALDAV_APP_URL ?? CALDAV;
const AUTH = `Basic ${Buffer.from("host:hostpass").toString("base64")}`;
const HOST_TZ = "Europe/Istanbul";

async function dav(method: string, path: string, body?: string, headers: Record<string, string> = {}) {
  return fetch(`${CALDAV}${path}`, { method, headers: { authorization: AUTH, ...headers }, body });
}

/** Removes every calendar of the Radicale test user, then creates one fresh calendar. */
async function freshCalendar(name: string): Promise<string> {
  const list = await (await dav("PROPFIND", "/host/", undefined, { depth: "1" })).text();
  for (const href of [...list.matchAll(/<(?:\w+:)?href>([^<]+)<\/(?:\w+:)?href>/g)].map((m) => m[1])) {
    if (href !== "/host/" && href.startsWith("/host/")) await dav("DELETE", href);
  }
  const path = `/host/${name}/`;
  const mk = await dav(
    "MKCALENDAR",
    path,
    `<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>${name}</D:displayname></D:prop></D:set></C:mkcalendar>`,
    { "content-type": "application/xml" },
  );
  expect(mk.status).toBe(201);
  return path;
}

async function calendarObjects(path: string): Promise<string[]> {
  const list = await (await dav("PROPFIND", path, undefined, { depth: "1" })).text();
  return [...list.matchAll(/<(?:\w+:)?href>([^<]+\.ics)<\/(?:\w+:)?href>/g)].map((m) => m[1]);
}

/** A weekday at least 3 days ahead (host's zone), as { iso: "YYYY-MM-DD", label: "Monday, October 5, 2026" }. */
function targetDay() {
  const d = new Date(Date.now() + 3 * 86_400_000);
  while ([0, 6].includes(new Date(d.toLocaleString("en-US", { timeZone: HOST_TZ })).getDay())) d.setTime(d.getTime() + 86_400_000);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: HOST_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(
    Date.parse(`${iso}T12:00:00Z`),
  );
  return { iso, label, compact: iso.replaceAll("-", "") };
}

async function openDay(page: Page, label: string) {
  const calendar = page.locator('section[aria-label="Choose a date"]');
  for (let i = 0; i < 3; i++) {
    await expect(calendar).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
    const day = page.getByRole("button", { name: new RegExp(`^${label}`) });
    if (await day.count()) {
      await day.click();
      return;
    }
    await page.getByRole("button", { name: "Next month" }).click();
  }
  throw new Error(`day ${label} not found`);
}

async function slotTimes(page: Page): Promise<string[]> {
  const buttons = page.locator('section[aria-label="Choose a time"] li button');
  await expect(buttons.first()).toBeVisible();
  return (await buttons.allTextContents()).map((t) => t.trim());
}

async function hostWithCaldav(page: Page, calendarName: string) {
  const calPath = await freshCalendar(calendarName);
  await signUpVerified(page, "Cal Host", "calhost");
  const username = `cal${Date.now().toString(36)}`;
  await configureProfile(page, username, HOST_TZ);
  await createEventType(page, "Intro call", { minNotice: "0" });

  await page.goto("/settings/calendars");
  await page.getByLabel("Provider").selectOption("other");
  await page.getByLabel("Server URL").fill(`${CALDAV_FROM_APP}/`);
  await page.getByLabel("Username").fill("host");
  await page.getByLabel("Password", { exact: true }).fill("hostpass");
  await page.getByRole("button", { name: "Connect CalDAV" }).click();
  await expect(page.getByText("Calendar connected.")).toBeVisible();
  await expect(page.getByRole("button", { name: `Check ${calendarName} for conflicts` })).toHaveAttribute("aria-pressed", "true");
  return { username, calPath };
}

async function guestPage(browser: Browser, url: string) {
  const context = await browser.newContext({ timezoneId: HOST_TZ, locale: "en-US" });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "24h" }).click();
  return { context, page };
}

test("OAuth providers stay hidden when not configured (INT-013)", async ({ page }) => {
  await signUpVerified(page, "Plain User", "plain");
  await page.goto("/settings/calendars");
  await expect(page.getByRole("heading", { name: "CalDAV (iCloud, Fastmail, Nextcloud…)" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Connect Google Calendar/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Connect Zoom/ })).toHaveCount(0);
});

test("CalDAV: busy events block slots; bookings are written, and deleted on cancel (INT-004, AVL-006, INT-007)", async ({ page, browser }) => {
  const day = targetDay();
  const { username, calPath } = await hostWithCaldav(page, `e2e-${Date.now().toString(36)}`);

  // An existing 09:00–10:00 meeting (host time) on the target day.
  const put = await dav(
    "PUT",
    `${calPath}busy.ics`,
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e//EN", "BEGIN:VEVENT", "UID:e2e-busy", "DTSTAMP:20260101T000000Z", `DTSTART;TZID=${HOST_TZ}:${day.compact}T090000`, `DTEND;TZID=${HOST_TZ}:${day.compact}T100000`, "SUMMARY:Busy", "END:VEVENT", "END:VCALENDAR"].join("\r\n"),
    { "content-type": "text/calendar" },
  );
  expect(put.status).toBe(201);

  const guest = await guestPage(browser, `/${username}/intro-call`);
  await openDay(guest.page, day.label);
  const times = await slotTimes(guest.page);
  expect(times).not.toContain("09:00");
  expect(times).not.toContain("09:30");
  expect(times).toContain("10:00");

  // Book 10:00 → the event appears in the CalDAV calendar.
  const email = uniqueEmail("caldav-booker");
  await guest.page.getByRole("button", { name: "10:00", exact: true }).click();
  await guest.page.getByLabel("Your name").fill("Carla Booker");
  await guest.page.getByLabel("Email").fill(email);
  await guest.page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(guest.page.getByRole("heading", { name: "You are scheduled" })).toBeVisible();
  await expect.poll(async () => (await calendarObjects(calPath)).length, { timeout: 30_000 }).toBe(2);

  // Cancel → the event is removed from the calendar.
  await guest.page.getByRole("button", { name: "Cancel booking" }).click();
  await guest.page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(guest.page.getByRole("heading", { name: "This booking is cancelled" })).toBeVisible();
  await expect.poll(async () => (await calendarObjects(calPath)).length, { timeout: 30_000 }).toBe(1);
  await guest.context.close();
});

test("ICS feed blocks availability (INT-005)", async ({ page, browser }) => {
  const day = targetDay();
  const feed = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//e2e//EN", "BEGIN:VEVENT", "UID:feed-1", "DTSTAMP:20260101T000000Z", `DTSTART;TZID=${HOST_TZ}:${day.compact}T110000`, `DTEND;TZID=${HOST_TZ}:${day.compact}T120000`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/calendar" });
    res.end(feed);
  });
  await new Promise<void>((resolve) => server.listen(5299, resolve));
  try {
    await freshCalendar("unused");
    await signUpVerified(page, "Feed Host", "feedhost");
    const username = `feed${Date.now().toString(36)}`;
    await configureProfile(page, username, HOST_TZ);
    await createEventType(page, "Intro call", { minNotice: "0" });
    await page.goto("/settings/calendars");
    await page.getByLabel("Calendar feed URL (.ics)").fill(`http://${HOST_FROM_APP}:5299/feed.ics`);
    await page.getByRole("button", { name: "Add feed" }).click();
    await expect(page.getByText("Feed added.")).toBeVisible();
    await expect(page.getByText(`${HOST_FROM_APP} (read-only feed)`)).toBeVisible();

    const guest = await guestPage(browser, `/${username}/intro-call`);
    await openDay(guest.page, day.label);
    const times = await slotTimes(guest.page);
    expect(times).toContain("10:30");
    expect(times).not.toContain("11:00");
    expect(times).not.toContain("11:30");
    expect(times).toContain("12:00");
    await guest.context.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("locations: invitee picks phone or Jitsi; details show on the confirmation and in the email (EVT-008, INT-010, INT-011)", async ({ page, browser }) => {
  await freshCalendar("unused");
  await signUpVerified(page, "Loc Host", "lochost");
  const username = `loc${Date.now().toString(36)}`;
  await configureProfile(page, username, HOST_TZ);
  await createEventType(page, "Intro call", { minNotice: "0" });
  await page.getByRole("link", { name: "Intro call", exact: true }).click();
  for (const kind of ["Jitsi Meet", "Phone call (you call the invitee)"]) {
    await page.getByLabel("Add a location").selectOption({ label: kind });
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Event type saved.")).toBeVisible();

  const day = targetDay();
  // Phone: the invitee enters their number.
  let guest = await guestPage(browser, `/${username}/intro-call`);
  await expect(guest.page.getByText("Jitsi Meet", { exact: true })).toBeVisible();
  await openDay(guest.page, day.label);
  await guest.page.getByRole("button", { name: "09:00", exact: true }).click();
  await guest.page.getByLabel("Your name").fill("Pat Phone");
  await guest.page.getByLabel("Email").fill(uniqueEmail("phone"));
  await guest.page.getByRole("radio", { name: "Phone call (you call the invitee)" }).check();
  await guest.page.getByLabel("Your phone number").fill("+1 415 555 0100");
  await guest.page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(guest.page.getByText("The host will call you at +14155550100")).toBeVisible();
  await guest.context.close();

  // Jitsi (the default location): a unique room per booking, also in the email.
  guest = await guestPage(browser, `/${username}/intro-call`);
  await openDay(guest.page, day.label);
  await guest.page.getByRole("button", { name: "10:00", exact: true }).click();
  const email = uniqueEmail("jitsi");
  await guest.page.getByLabel("Your name").fill("Jo Jitsi");
  await guest.page.getByLabel("Email").fill(email);
  await guest.page.getByRole("button", { name: "Confirm booking" }).click();
  const room = guest.page.getByRole("link", { name: /^https:\/\/meet\.jit\.si\/intro-call-/ });
  await expect(room).toBeVisible();
  const roomUrl = (await room.getAttribute("href"))!;
  const mail = await waitForEmail(email, /^Confirmed: Intro call/);
  expect(mail.text).toContain(roomUrl);
  expect(mail.raw).toContain("LOCATION:https://meet.jit.si/intro-call-");
  await guest.context.close();
});

test("metrics endpoint requires its token (NFR-010)", async ({ request }) => {
  const token = process.env.METRICS_TOKEN ?? "dev-metrics-token-0123456789";
  expect((await request.get("/api/metrics")).status()).toBe(401);
  const res = await request.get("/api/metrics", { headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain("# TYPE opencalendar_slot_request_duration_seconds histogram");
  expect(text).toContain("opencalendar_bookings{status=");
});
