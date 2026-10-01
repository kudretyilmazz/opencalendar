import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { uniqueEmail, waitForEmailLink } from "./mailpit";

export const PASSWORD = "e2e correct horse battery";

/**
 * Requests the browser cancels because the test navigates on (Next.js RSC prefetches, the dev
 * overlay): WebKit reports them as "access control checks"/"Load failed", Firefox as a
 * NetworkError. Next falls back to a normal navigation; a real failure still fails the test's
 * own assertions.
 */
const ABORTED_FETCH =
  /_rsc=|Failed to fetch RSC payload|__nextjs_original-stack-frames|^TypeError: Load failed$|NetworkError when attempting to fetch resource/;

/**
 * Development-only React warning: after a Server Action redirect, `next dev` re-renders the whole
 * tree on the client, including the root layout's pre-paint theme script. The script already ran
 * on load; production builds (what CI tests) don't emit this warning.
 */
const DEV_ONLY = /Encountered a script tag while rendering React component/;

/**
 * Playwright's trace recorder injects its snapshot script into every frame; the email embed's
 * preview is a script-less `sandbox=""` srcdoc frame, so Chrome logs the blocked injection. The
 * email HTML itself never contains scripts (asserted in email-html.test.ts and embed-builder.spec.ts).
 */
const TRACE_IN_SANDBOX = /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

/** Fails the current test on any browser error (hydration mismatches, exceptions, CSP). */
export function guardBrowserErrors() {
  let errors: string[] = [];
  test.beforeEach(({ page }) => {
    errors = [];
    page.on("pageerror", (error) => {
      if (!ABORTED_FETCH.test(error.message)) errors.push(`pageerror: ${error.message}`);
    });
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" &&
        !/Failed to load resource/.test(text) &&
        !ABORTED_FETCH.test(text) &&
        !DEV_ONLY.test(text) &&
        !TRACE_IN_SANDBOX.test(text)
      ) {
        errors.push(`console: ${text}`);
      }
    });
  });
  test.afterEach(() => {
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

/** Zero serious/critical axe violations (NFR-008). */
/**
 * Frames axe must skip: it runs inside every frame, and a script-less `sandbox=""` frame never
 * answers, so the run would hang. The email embed's preview is one; its content is an email, not
 * a page, and the panel around it is still checked.
 */
const AXE_EXCLUDE = ['iframe[title="Email preview"]'];

export async function expectAccessible(page: Page) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  for (const selector of AXE_EXCLUDE) builder.exclude(selector);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  // For contrast failures, include the measured colors so a CI failure explains itself.
  const detail = (n: (typeof blocking)[number]["nodes"][number]) => {
    const data = n.any.find((c) => c.id === "color-contrast")?.data as
      { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
    return data?.fgColor
      ? `${n.target.join(" ")} (${data.fgColor} on ${data.bgColor}, ${data.contrastRatio})`
      : n.target.join(" ");
  };
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map(detail).join(", ")}`)).toEqual([]);
}

/** Signs up, verifies by email, and lands on the dashboard. */
export async function signUpVerified(page: Page, name: string, prefix: string): Promise<string> {
  const email = uniqueEmail(prefix);
  await resetRateLimits();
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);
  await page.goto(await waitForEmailLink(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  return email;
}

/**
 * Picks an option in a shadcn Select or Combobox: opens the trigger, then clicks the option
 * (rendered in a portal, so it is looked up on the page, not inside the trigger's form).
 */
export async function pickOption(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

/** Picks `iso` (yyyy-MM-dd) in a shadcn DatePicker: opens it and pages forward to that month. */
export async function pickDate(page: Page, trigger: Locator, iso: string) {
  await trigger.click();
  const day = page.locator(`[data-slot="popover-content"] td[data-day="${iso}"] button`);
  for (let i = 0; i < 24 && !(await day.isVisible()); i++) {
    await page.getByRole("button", { name: "Go to the Next Month" }).click();
  }
  await day.click();
}

/**
 * Waits until React has hydrated the page's first form. Typing earlier is lost: hydration puts a
 * controlled input back to its state value (seen in WebKit against the slower dev server).
 */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector("main form");
    return !!form && Object.keys(form).some((key) => key.startsWith("__reactFiber$"));
  });
}

/** Sets username and time zone for a host. */
export async function configureProfile(page: Page, username: string, timeZone: string) {
  await page.goto("/settings/profile");
  await waitForHydration(page);
  await page.getByLabel("Username").fill(username);
  await pickOption(page, page.getByLabel("Time zone"), timeZone.replaceAll("_", " "));
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
}

/** Creates an event type through the UI; returns its slug. */
export async function createEventType(page: Page, title: string, options: { minNotice?: string } = {}) {
  await page.goto("/event-types/new");
  await waitForHydration(page);
  await page.getByLabel("Title").fill(title);
  if (options.minNotice !== undefined) await page.getByLabel("Minimum notice", { exact: true }).fill(options.minNotice);
  await page.getByRole("button", { name: "Create event type" }).click();
  await expect(page).toHaveURL(/\/event-types$/);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
}

/** On a booking page: picks the first bookable day (advancing months if needed) and returns the day button. */
export async function pickFirstAvailableDay(page: Page) {
  const calendar = page.locator('section[aria-label="Choose a date"]');
  const days = calendar.getByRole("group", { name: "Days" });
  const available = days.locator("button:not([disabled])");
  for (let i = 0; i < 3; i++) {
    await expect(calendar).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
    if ((await available.count()) > 0) break;
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await available.first().click();
  await expect(days.locator('button[aria-pressed="true"]')).toHaveCount(1);
}

/** Clears auth rate-limit counters: every E2E sign-up comes from the same IP. */
export async function resetRateLimits() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('DELETE FROM "rate_limit"');
  } finally {
    await pool.end();
  }
}

export async function firstSlotButton(page: Page) {
  const slot = page.locator('section[aria-label="Choose a time"] li button').first();
  await expect(slot).toBeVisible();
  return slot;
}

/** Reads one value straight from the app database (assertions the UI doesn't show). */
export async function queryValue<T>(text: string, values: unknown[]): Promise<T | undefined> {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL or DATABASE_URL is required");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const result = await pool.query(text, values);
    return result.rows[0] ? (Object.values(result.rows[0])[0] as T) : undefined;
  } finally {
    await pool.end();
  }
}

/** Runs one statement against the app database (setup the UI can't do, e.g. the first admin). */
export async function execSql(text: string, values: unknown[] = []): Promise<void> {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL or DATABASE_URL is required");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(text, values);
  } finally {
    await pool.end();
  }
}
