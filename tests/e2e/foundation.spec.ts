import { expect, type Page, test } from "@playwright/test";
import { guardBrowserErrors, pickOption } from "./helpers";
import { uniqueEmail, waitForEmailLink } from "./mailpit";

const PASSWORD = "e2e correct horse battery";

// Fail on any browser error (hydration mismatches, uncaught exceptions, CSP violations).
guardBrowserErrors();

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Erin Example");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);
}

test("health endpoints report ready (ADM-004)", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toMatchObject({ status: "ok", version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toMatchObject({ status: "ok" });
});

test("protected pages redirect to sign in and send security headers (NFR-006)", async ({ page }) => {
  const response = await page.goto("/login");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-/);
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprofile/);
});

test("sign up → verify email → dashboard → save settings → sign out → sign in (AUTH-001, ADM-005)", async ({ page }) => {
  const email = uniqueEmail("erin");
  await signUp(page, email);

  // Unverified accounts cannot sign in yet.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/please verify your email/i)).toBeVisible();

  // Verification link from the queued email (sent by the pg-boss worker through SMTP).
  await page.goto(await waitForEmailLink(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /welcome, erin/i })).toBeVisible();

  // Settings: save profile preferences.
  await page.getByRole("link", { name: "Settings" }).click();
  const username = `erin${Date.now()}`;
  await page.getByLabel("Username").fill(username);
  await pickOption(page, page.getByLabel("Time zone"), "Europe/Istanbul");
  await pickOption(page, page.getByLabel("Week starts on"), "Sunday");
  await page.getByRole("radio", { name: "12-hour" }).check();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
  // App shell: only <main> scrolls. Radix's hidden form inputs (mounted after hydration, so check
  // on a live page) once stretched the document past the window here, leaving a grey band.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.getByLabel("Username")).toHaveValue(username);
  await expect(page.locator('input[name="timeZone"]')).toHaveValue("Europe/Istanbul");

  // Reserved usernames are rejected with a field error.
  await page.getByLabel("Username").fill("dashboard");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("This username is reserved")).toBeVisible();

  // Sign out, then open a protected page: sign in returns there (safe `next` redirect).
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);

  // An off-site `next` is ignored.
  await page.goto("/login?next=//evil.example.com");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("magic link sign-in (AUTH-002)", async ({ page }) => {
  const email = uniqueEmail("mo");
  await page.goto("/login");
  await page.getByRole("button", { name: /email link instead/i }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText(/check your inbox/i);

  await page.goto(await waitForEmailLink(email, /sign in/i));
  await expect(page).toHaveURL(/\/dashboard/);
});

test("password reset (AUTH-001)", async ({ page }) => {
  const email = uniqueEmail("pat");
  await signUp(page, email);
  await page.goto(await waitForEmailLink(email, /verify/i));
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(/reset link/i);

  await page.goto(await waitForEmailLink(email, /reset/i));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const newPassword = "a brand new passphrase";
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
