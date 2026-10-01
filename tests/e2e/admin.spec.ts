import { type Browser, expect, type Page, test } from "@playwright/test";
import { execSql, expectAccessible, guardBrowserErrors, signUpVerified, waitForHydration } from "./helpers";
import { uniqueEmail, waitForEmail } from "./mailpit";

/**
 * Instance administration (ADM-009, ADM-011): branding, footer, theme, emails, platform settings
 * and account management, as an admin and as everyone else. Runs in order; the last test (and
 * afterAll, as a backstop) puts the instance back to its defaults for the other specs.
 */
test.describe.configure({ mode: "serial" });
guardBrowserErrors();

const APP_NAME = `Acme Meet ${Date.now()}`;
// 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let admin: Page;
let memberEmail: string;
let member: Page;

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
}

test.afterAll(async () => {
  await execSql("DELETE FROM instance_settings");
  await execSql("DELETE FROM instance_asset");
});

test("members can't reach the admin area", async ({ browser }) => {
  member = await freshPage(browser);
  memberEmail = await signUpVerified(member, "Member Mo", "member");
  await expect(member.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await member.goto("/admin/branding");
  await expect(member).toHaveURL(/\/dashboard$/);
});

test("an admin sees the admin area", async ({ browser }) => {
  admin = await freshPage(browser);
  const email = await signUpVerified(admin, "Admin Ada", "admin");
  await execSql(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [email]);
  await admin.reload();
  await admin.getByRole("link", { name: "Administration" }).click();
  await expect(admin.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(admin.getByText("Active administrators")).toBeVisible();
  await expectAccessible(admin);
});

test("branding renames the app and controls the footer (ADM-011)", async ({ browser }) => {
  await admin.goto("/admin/branding");
  await waitForHydration(admin);
  await expectAccessible(admin);
  await admin.getByLabel("App name").fill(APP_NAME);
  await admin.getByRole("switch", { name: /Hide “Powered by OpenCalendar”/ }).click();
  await save(admin);

  await admin.goto("/dashboard");
  await expect(admin).toHaveTitle(new RegExp(`· ${APP_NAME}$`));
  await expect(admin.getByRole("link", { name: APP_NAME }).first()).toBeVisible();
  const footer = admin.locator("footer").last();
  await expect(footer).not.toContainText("Powered by");
  await expect(footer.getByRole("link", { name: "Source code (AGPL-3.0)" })).toBeVisible();

  // Hiding the source link moves it to /about, which always offers the code.
  await admin.goto("/admin/branding");
  await waitForHydration(admin);
  await admin.getByRole("switch", { name: "Hide the source code link" }).click();
  await expect(admin.getByText(/AGPL-3.0 \(section 13\)/)).toBeVisible();
  await save(admin);

  const visitor = await freshPage(browser);
  await visitor.goto("/login");
  await expect(visitor.locator("footer")).toHaveCount(0);
  await visitor.goto("/about");
  await expect(visitor.getByRole("heading", { name: APP_NAME })).toBeVisible();
  await expect(visitor.getByRole("link", { name: /^https?:\/\// })).toBeVisible();
  await visitor.context().close();
});

test("uploads a favicon served from the database (ADM-011)", async () => {
  await admin.goto("/admin/branding");
  await waitForHydration(admin);
  await admin.locator("#asset-favicon").setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: PNG });
  await admin.locator("#asset-favicon").locator("xpath=following-sibling::button").click();
  await expect(admin.getByRole("img", { name: "Current favicon" })).toBeVisible();

  const href = await admin.locator('link[rel="icon"]').first().getAttribute("href");
  expect(href).toMatch(/^\/api\/branding\/favicon\?v=[0-9a-f]{16}$/);
  const response = await admin.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toContain("immutable");
  expect(Buffer.from(await response.body())).toEqual(PNG);

  // A file that only claims to be an image is refused.
  await admin.locator("#asset-logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<html></html>") });
  await admin.locator("#asset-logo").locator("xpath=following-sibling::button").click();
  await expect(admin.getByText(/Unsupported file type/)).toBeVisible();
});

test("theme colors apply everywhere and unreadable ones are refused (ADM-011)", async () => {
  await admin.goto("/admin/theme");
  await waitForHydration(admin);
  await expectAccessible(admin);
  await admin.getByLabel("Primary (light)", { exact: true }).fill("#f5f5f5");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByText(/Too close to the light background/)).toBeVisible();

  await admin.getByLabel("Primary (light)", { exact: true }).fill("#1d4ed8");
  await save(admin);
  await admin.goto("/dashboard");
  await admin.evaluate(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
  });
  const primary = await admin.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  expect(primary).toBe("#1d4ed8");
});

test("emails carry the instance name and footer (ADM-011)", async ({ browser }) => {
  await admin.goto("/admin/emails");
  await waitForHydration(admin);
  await expectAccessible(admin);
  await admin.getByLabel("Footer text").fill("Acme Inc., 1 Main Street");
  await save(admin);

  const visitor = await freshPage(browser);
  const email = uniqueEmail("branded");
  await visitor.goto("/login");
  await visitor.getByRole("button", { name: /email link instead/i }).click();
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByRole("button", { name: "Email me a sign-in link" }).click();
  const message = await waitForEmail(email, /sign in/i);
  // Plain-text rendering upper-cases headings.
  expect(message.text.toLowerCase()).toContain(`sign in to ${APP_NAME}`.toLowerCase());
  expect(message.text).not.toMatch(/opencalendar/i);
  expect(message.text).toContain("Acme Inc., 1 Main Street");
  await visitor.context().close();
});

test("platform settings control sign-ups and the sign-in notice (ADM-009)", async ({ browser }) => {
  await admin.goto("/admin/platform");
  await waitForHydration(admin);
  await expectAccessible(admin);
  await admin.getByLabel("Who can create an account").click();
  await admin.getByRole("option", { name: "Closed" }).click();
  await admin.getByLabel("Sign-in notice").fill("Ask IT for an account.");
  await save(admin);

  const visitor = await freshPage(browser);
  await visitor.goto("/signup");
  await expect(visitor.getByRole("heading", { name: "Sign-ups are closed" })).toBeVisible();
  await expect(visitor.getByTestId("login-message")).toHaveText("Ask IT for an account.");
  await visitor.context().close();
});

test("admins disable and promote accounts but can't lock themselves out (ADM-009)", async () => {
  await admin.goto(`/admin/users?q=${encodeURIComponent(memberEmail)}`);
  await waitForHydration(admin);
  await expectAccessible(admin);
  const row = admin.getByTestId(`user-row-${memberEmail}`);
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible();

  await member.goto("/dashboard");
  await expect(member).toHaveURL(/\/login/);

  await row.getByRole("button", { name: "Enable" }).click();
  await expect(row.getByRole("button", { name: "Disable" })).toBeVisible();
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(row.getByText("Administrator")).toBeVisible();

  await admin.goto("/admin/users?role=admin");
  await expect(admin.getByText("You", { exact: true })).toBeVisible();
});

test("restores the default branding", async () => {
  for (const [path, fill] of [
    ["/admin/branding", async () => {
      await admin.getByLabel("App name").fill("OpenCalendar");
      await admin.getByRole("switch", { name: /Hide “Powered by OpenCalendar”/ }).click();
      await admin.getByRole("switch", { name: "Hide the source code link" }).click();
    }],
    ["/admin/theme", async () => admin.getByLabel("Primary (light)", { exact: true }).fill("")],
    ["/admin/emails", async () => admin.getByLabel("Footer text").fill("")],
    ["/admin/platform", async () => {
      await admin.getByLabel("Who can create an account").click();
      await admin.getByRole("option", { name: /^Server default/ }).click();
      await admin.getByLabel("Sign-in notice").fill("");
    }],
  ] as const) {
    await admin.goto(path);
    await waitForHydration(admin);
    await fill();
    await save(admin);
  }
  await admin.goto("/admin/branding");
  await admin.getByRole("button", { name: "Use default" }).click();
  await expect(admin.getByRole("img", { name: "Current favicon" })).toHaveCount(0);
  await admin.goto("/dashboard");
  await expect(admin.locator("footer").last()).toContainText("Powered by OpenCalendar");
});
