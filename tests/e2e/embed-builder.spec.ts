import { type Browser, expect, type Page, test } from "@playwright/test";
import { configureProfile, createEventType, expectAccessible, guardBrowserErrors, signUpVerified } from "./helpers";
import { uniqueEmail } from "./mailpit";

guardBrowserErrors();
// Each test signs up, creates an event type and books; the dev server needs more than the default.
test.describe.configure({ timeout: 90_000 });

const HOST_TZ = "Europe/Istanbul";

async function setupHost(page: Page, prefix: string) {
  await signUpVerified(page, "Emre Embed", prefix);
  const username = `${prefix}${Date.now().toString(36)}`;
  await configureProfile(page, username, HOST_TZ);
  await createEventType(page, "Intro call", { minNotice: "0" });
  return { username, calLink: `${username}/intro-call` };
}

async function openEmbedDialog(page: Page) {
  await page.goto("/event-types");
  await page.getByRole("button", { name: "More actions for Intro call" }).click();
  await page.getByRole("menuitem", { name: "Embed" }).click();
  const dialog = page.getByRole("dialog", { name: "Embed Intro call" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillBookingForm(page: Page) {
  await page.getByLabel("Your name").fill("Eda Email");
  await page.getByLabel("Email").fill(uniqueEmail("emailembed"));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You are scheduled" })).toBeVisible();
}

async function guest(browser: Browser) {
  const context = await browser.newContext({ timezoneId: HOST_TZ, locale: "en-US" });
  return { context, page: await context.newPage() };
}

test("embed builder: inline, floating and popup code with a live preview (EMB-007)", async ({ page }) => {
  const { calLink } = await setupHost(page, "emb");
  const dialog = await openEmbedDialog(page);
  const code = dialog.getByLabel("Embed code");

  // Inline: the snippet targets this event type and the preview runs the real loader.
  await expect(code).toContainText(`data-opencalendar-inline="${calLink}"`);
  await expect(code).toContainText("/embed.js");
  const preview = dialog.frameLocator('iframe[title="Preview of the Intro call embed"]');
  await expect(preview.frameLocator("iframe").first().getByRole("heading", { name: "Intro call" })).toBeVisible({ timeout: 20_000 });

  // Other formats of the same inline embed.
  await dialog.getByRole("radio", { name: "iframe" }).click();
  await expect(code).toContainText(`${calLink}?`);
  await expect(code).toContainText("embed=1");
  await dialog.getByRole("radio", { name: "Link" }).click();
  await expect(code).toContainText(`/${calLink}`);

  // Floating button: loader call plus a working button in the preview.
  await dialog.getByRole("tab", { name: "Floating button" }).click();
  await expect(code).toContainText("OpenCalendar.floatingButton(");
  await expect(code).toContainText(calLink);
  const floating = dialog.frameLocator('iframe[title="Preview of the Intro call embed"]');
  await floating.getByRole("button", { name: "Book a meeting" }).click({ timeout: 20_000 });
  await expect(floating.getByRole("dialog", { name: "Book a meeting" })).toBeVisible();

  // Popup on click.
  await dialog.getByRole("tab", { name: "Popup" }).click();
  await expect(code).toContainText(`data-opencalendar-link="${calLink}"`);

  // An event type offers the email embed.
  await expect(dialog.getByRole("tab", { name: "Email" })).toBeVisible();
  await expectAccessible(page);
});

test("email embed: picked times link straight to the booking form (EMB-008)", async ({ page, browser }) => {
  const { calLink } = await setupHost(page, "eml");
  const dialog = await openEmbedDialog(page);
  await dialog.getByRole("tab", { name: "Email" }).click();

  // The first day with free times (this week or a following one: the default schedule is Mon–Fri).
  const days = dialog.getByRole("group", { name: "Days" });
  // Days with no times are disabled; the enabled ones have free times.
  const freeDay = days.locator("button[data-day]:not([disabled])").first();
  for (let i = 0; i < 3 && !(await freeDay.isVisible().catch(() => false)); i++) {
    await dialog.getByRole("button", { name: "Next week" }).click();
    await page.waitForTimeout(500);
  }
  await freeDay.click();
  const chips = dialog.locator("[data-slot-start]");
  await expect(chips.first()).toBeVisible();
  await chips.nth(0).click();
  await chips.nth(1).click();
  await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByTestId("email-embed-count")).toHaveText("2 of 10 times selected");

  // The generated email: one link per picked time, pointing at that start. (Read from the HTML
  // source: the preview iframe is sandboxed without scripts, which Playwright can't look into.)
  const firstStart = (await chips.nth(0).getAttribute("data-slot-start"))!;
  await expect(dialog.getByTitle("Email preview")).toBeVisible();
  await dialog.getByText("Show HTML").click();
  const source = await dialog.getByLabel("Email HTML").inputValue();
  const hrefs = [...source.matchAll(/href="([^"]*slot=[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
  expect(hrefs).toHaveLength(2);
  expect(source).not.toContain("<script");
  const href = hrefs[0];
  expect(href).toContain(`/${calLink}?`);
  expect(href).toContain(`slot=${encodeURIComponent(firstStart)}`);
  expect(href).not.toContain("token");
  await expectAccessible(page);

  // Following the link opens the booking form on that time; booking it works.
  const first = await guest(browser);
  await first.page.goto(href);
  await expect(first.page.getByLabel("Your name")).toBeVisible({ timeout: 20_000 });
  await fillBookingForm(first.page);
  await first.context.close();

  // The same link again: the time is taken, so the day opens with a notice instead.
  const second = await guest(browser);
  await second.page.goto(href);
  await expect(second.page.getByRole("status").filter({ hasText: "That time is no longer available" })).toBeVisible({ timeout: 20_000 });
  await expect(second.page.getByLabel("Your name")).toHaveCount(0);
  await second.context.close();
});

test("week layout: book from the week view; the booker can switch layouts (EMB-009)", async ({ page, browser }) => {
  const { calLink } = await setupHost(page, "wk");
  const { context, page: booker } = await guest(browser);
  await booker.goto(`/${calLink}?layout=week`);

  const week = booker.locator('section[aria-label="Choose a date and time"]');
  await expect(booker.getByRole("group", { name: "Week" })).toBeVisible();
  await expect(booker.getByRole("button", { name: "Previous week" })).toBeDisabled();
  const slot = week.locator("li button").first();
  for (let i = 0; i < 3; i++) {
    await expect(week).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
    if ((await week.locator("li button").count()) > 0) break;
    await booker.getByRole("button", { name: "Next week" }).click();
  }
  await expectAccessible(booker);
  await slot.click();
  await fillBookingForm(booker);

  // Layout switcher keeps the URL in sync.
  await booker.goto(`/${calLink}?name=Ada`);
  const layout = booker.getByRole("radiogroup", { name: "Layout" });
  await layout.getByRole("radio", { name: "Week" }).click();
  await expect(booker).toHaveURL(/layout=week/);
  await expect(booker).toHaveURL(/name=Ada/);
  await layout.getByRole("radio", { name: "Month" }).click();
  await expect(booker.locator('section[aria-label="Choose a date"]')).toBeVisible();
  await context.close();
});

test("embed preview route: validates its input and only frames on this origin", async ({ page }) => {
  const ok = await page.request.get("/embed/preview?calLink=ada/intro&mode=inline&embed=1");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(ok.headers()["x-frame-options"]).toBeUndefined();
  expect(ok.headers()["x-robots-tag"] ?? (await ok.text())).toMatch(/noindex/);

  // Anything but a booking path is refused, so the route can't be used to load arbitrary pages.
  await page.goto("/embed/preview?calLink=https%3A%2F%2Fevil.example&mode=inline&embed=1");
  await expect(page.getByText("This preview link is not valid.")).toBeVisible();
  await page.goto("/embed/preview?calLink=ada%2F..%2Fdashboard&mode=inline&embed=1");
  await expect(page.getByText("This preview link is not valid.")).toBeVisible();
});
