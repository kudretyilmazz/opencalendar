import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Browser, expect, type Locator, type Page, test } from "@playwright/test";
import { PASSWORD, resetRateLimits, waitForHydration } from "../../tests/e2e/helpers";
import { waitForEmailLink } from "../../tests/e2e/mailpit";

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "docs/images");
const EMAIL = "alex.rivera@demo.opencalendar.test";
const USERNAME = "alex";
/** What the screenshots show instead of the local address. */
const SHOWN_HOST = "cal.example.com";

/**
 * The demo host lives where it is mid-morning right now, so "today" on the dashboard has meetings
 * ahead in office hours whenever the script runs.
 */
const ZONES = [
  "Pacific/Honolulu", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo",
  "Atlantic/Azores", "Europe/London", "Europe/Berlin", "Europe/Istanbul", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata",
  "Asia/Dhaka", "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Noumea", "Pacific/Auckland",
];
function midMorningZone(now = Date.now()): string {
  const minutesOfDay = (tz: string) => {
    const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
    return h * 60 + m;
  };
  const target = 10 * 60 + 30;
  return ZONES.reduce((best, tz) => (Math.abs(minutesOfDay(tz) - target) < Math.abs(minutesOfDay(best) - target) ? tz : best));
}
const TZ = midMorningZone();
test.use({ timezoneId: TZ });

function seed(...args: string[]) {
  execFileSync("npx", ["tsx", "--env-file=.env", "scripts/screenshots/seed.ts", ...args], { cwd: ROOT, stdio: "inherit" });
}

/**
 * Captures the viewport (or `crop`, with a margin) after hiding dev-only chrome and showing a
 * production-like address.
 */
async function shot(page: Page, name: string, crop?: Locator) {
  // Edit the DOM only once React owns it: text swapped before hydration is a hydration mismatch.
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    return !!main && Object.keys(main).some((key) => key.startsWith("__reactFiber$"));
  });
  // Every app frame: the embed preview nests the app, dev indicator included. (Skip the email
  // preview's script-less sandboxed srcdoc frame: nothing can be injected there, and it has no indicator.)
  const origin = new URL(page.url()).origin;
  for (const frame of page.frames().filter((f) => f.url().startsWith(origin))) {
    await frame.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" }).catch(() => undefined);
  }
  await page.evaluate((host) => {
    const local = window.location.host;
    const swap = (value: string) => value.replaceAll(`http://${local}`, `https://${host}`).replaceAll(local, host);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue?.includes(local)) node.nodeValue = swap(node.nodeValue);
    }
    for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      if (field.value.includes(local)) field.value = swap(field.value);
    }
  }, SHOWN_HOST);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const box = crop ? await crop.boundingBox() : null;
  const margin = 32;
  const clip = box ? { x: Math.max(0, box.x - margin), y: Math.max(0, box.y - margin), width: box.width + 2 * margin, height: box.height + 2 * margin } : undefined;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), caret: "initial", animations: "disabled", clip });
}

async function signUp(page: Page) {
  await resetRateLimits();
  await page.goto("/signup");
  await waitForHydration(page);
  await page.getByLabel("Name").fill("Alex Rivera");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);
  await page.goto(await waitForEmailLink(EMAIL, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
}

async function guestPage(browser: Browser, viewport = { width: 1440, height: 900 }, scale = 1.5) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, timezoneId: TZ, locale: "en-US", colorScheme: "light" });
  return { context, page: await context.newPage() };
}

test("README screenshots", async ({ page, browser }) => {
  mkdirSync(OUT, { recursive: true });
  seed("--reset", EMAIL, USERNAME);
  await signUp(page);
  seed(EMAIL, USERNAME, TZ);

  // A routing form through the real UI (its editor payload is easiest to build there).
  await page.goto("/routing-forms/new");
  await waitForHydration(page);
  await page.getByLabel("Name", { exact: true }).fill("Lead intake");
  await page.getByRole("button", { name: "Save routing form" }).click();
  await expect(page).toHaveURL(/\/routing-forms\/(?!new$)[^/]+$/);

  // Dashboard, light and dark.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /, Alex$/ })).toBeVisible();
  await shot(page, "dashboard");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot(page, "dashboard-dark");
  await page.emulateMedia({ colorScheme: "light" });

  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await shot(page, "bookings");

  await page.goto("/event-types");
  await expect(page.getByRole("link", { name: "Product demo", exact: true })).toBeVisible();
  await shot(page, "event-types");

  await page.goto("/availability");
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeVisible();
  await shot(page, "availability");

  // Embed builder: inline with the live preview, then the email embed.
  await page.goto("/event-types");
  await page.getByRole("button", { name: "More actions for Product demo" }).click();
  await page.getByRole("menuitem", { name: "Embed" }).click();
  const dialog = page.getByRole("dialog", { name: "Embed Product demo" });
  await expect(
    dialog.frameLocator('iframe[title="Preview of the Product demo embed"]').frameLocator("iframe").first().getByRole("heading", { name: "Product demo" }),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, "embed-builder");
  await dialog.getByRole("tab", { name: "Email" }).click();
  await dialog.getByRole("group", { name: "Days" }).locator("button[data-day]:not([disabled])").first().click();
  const chips = dialog.locator("[data-slot-start]");
  await expect(chips.first()).toBeVisible();
  for (const i of [0, 2, 4]) await chips.nth(i).click();
  await dialog.getByLabel("Message (optional)").fill("Here are a few times that work for me. Pick whichever suits you!");
  await shot(page, "email-embed");

  // What invitees see: the booking page (month with a day open) and the week layout.
  const guest = await guestPage(browser);
  // Late in the month, open the next one so the calendar isn't mostly past days.
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(Date.now()).split("-").map(Number);
  const nextMonth = `${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, "0")}`;
  await guest.page.goto(`/${USERNAME}/demo${day > 20 ? `?month=${nextMonth}` : ""}`);
  const calendar = guest.page.locator('section[aria-label="Choose a date"]');
  await expect(calendar).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  await calendar.getByRole("group", { name: "Days" }).locator("button:not([disabled])").first().click();
  await expect(guest.page.locator('section[aria-label="Choose a time"] li button').first()).toBeVisible();
  await shot(guest.page, "booking-page", guest.page.locator("main [data-slot=card]").first());
  await guest.page.goto(`/${USERNAME}/demo?layout=week`);
  await expect(guest.page.getByRole("group", { name: "Week" })).toBeVisible();
  await expect(guest.page.locator('section[aria-label="Choose a date and time"]')).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  await shot(guest.page, "booking-week", guest.page.locator("main [data-slot=card]").first());
  await guest.context.close();

  // Phones.
  const phone = await guestPage(browser, { width: 390, height: 844 }, 3);
  await phone.page.goto(`/${USERNAME}/demo`);
  await expect(phone.page.locator('section[aria-label="Choose a date"]')).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  await shot(phone.page, "mobile-booking");
  await phone.context.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /, Alex$/ })).toBeVisible();
  await shot(page, "mobile-dashboard");
});
