import { expect, type Page, test } from "@playwright/test";
import { configureProfile, createEventType, expectAccessible, guardBrowserErrors, signUpVerified } from "./helpers";
import { uniqueEmail } from "./mailpit";

/**
 * NFR-008: the date and slot pickers and the booking form work with the keyboard alone, embed
 * mode passes axe too, and reduced motion is honored.
 */

guardBrowserErrors();

/** Presses Tab until the focused element matches, so nothing is clicked or focused directly. */
async function tabTo(page: Page, matches: (el: { tag: string; label: string; disabled: boolean; name: string }) => boolean, max = 150) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return {
        tag: a?.tagName.toLowerCase() ?? "",
        label: a?.getAttribute("aria-label") ?? a?.textContent?.trim() ?? "",
        disabled: (a as HTMLButtonElement | null)?.disabled ?? false,
        name: a?.getAttribute("name") ?? a?.id ?? "",
      };
    });
    if (matches(el)) return el;
  }
  throw new Error("Focus never reached the expected element");
}

test("a booking can be made with the keyboard only; embed mode is accessible (NFR-008)", async ({ page, browser }) => {
  await signUpVerified(page, "Kira Keys", "keys");
  const username = `kira${Date.now().toString(36)}`;
  await configureProfile(page, username, "UTC");
  await createEventType(page, "Intro call", { minNotice: "0" });

  const context = await browser.newContext({ timezoneId: "UTC", reducedMotion: "reduce" });
  const guest = await context.newPage();
  await guest.goto(`/${username}/intro-call`);
  await expect(guest.locator('section[aria-label="Choose a date"]')).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
  // Reduced motion: transitions are switched off.
  const duration = await guest.locator("button").first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.01);

  // Advance months with the keyboard until a bookable day exists, then pick it.
  for (let i = 0; i < 3 && (await guest.getByRole("group", { name: "Days" }).locator("button:not([disabled])").count()) === 0; i++) {
    await tabTo(guest, (el) => el.label === "Next month");
    await guest.keyboard.press("Enter");
    await expect(guest.locator('section[aria-label="Choose a date"]')).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
  }
  await tabTo(guest, (el) => el.tag === "button" && !el.disabled && /^\w+, /.test(el.label) && !el.label.includes("no times"));
  await guest.keyboard.press("Enter");
  await expect(guest.getByRole("group", { name: "Days" }).locator('button[aria-pressed="true"]')).toHaveCount(1);
  await tabTo(guest, (el) => el.tag === "button" && /^\d{1,2}:\d{2}/.test(el.label));
  await guest.keyboard.press("Enter");

  await tabTo(guest, (el) => el.tag === "input" && /name/i.test(el.name));
  await guest.keyboard.type("Kim Keyboard");
  await tabTo(guest, (el) => el.tag === "input" && /email/i.test(el.name));
  await guest.keyboard.type(uniqueEmail("keyboard"));
  await tabTo(guest, (el) => el.tag === "button" && el.label === "Confirm booking");
  await guest.keyboard.press("Enter");
  await expect(guest.getByRole("heading", { name: "You are scheduled" })).toBeVisible();

  // The compact embed variant passes axe as well.
  await guest.goto(`/${username}/intro-call?embed=1`);
  await expect(guest.locator('section[aria-label="Choose a date"]')).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
  // Bookable days are fully drawn (not mid-way from the dimmed loading state) before axe checks contrast.
  await expect
    .poll(() => guest.getByRole("group", { name: "Days" }).locator("button:not([disabled])").evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === "1")))
    .toBe(true);
  await expectAccessible(guest);
  await context.close();
});
