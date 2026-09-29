import { expect, type Page, test } from "@playwright/test";
import { configureProfile, createEventType, expectAccessible, firstSlotButton, guardBrowserErrors, pickFirstAvailableDay, signUpVerified } from "./helpers";
import { uniqueEmail, waitForEmail, waitForEmailLink } from "./mailpit";

/**
 * M3 booking power features end to end: booking questions + URL prefill (EVT-009, BKG-014),
 * requires confirmation with the signed email link (EVT-011, BKG-012, NTF-004), default
 * reminder workflow (NTF-006), seats (EVT-012) and the troubleshooter (AVL-008).
 */

guardBrowserErrors();

async function setupHost(page: Page) {
  const hostEmail = await signUpVerified(page, "Pia Power", "power");
  const username = `pia${Date.now().toString(36)}`;
  await configureProfile(page, username, "Europe/Istanbul");
  await createEventType(page, "Intro call", { minNotice: "0" });
  await page.getByRole("link", { name: "Intro call", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Intro call" })).toBeVisible();
  return { hostEmail, username };
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Event type saved.")).toBeVisible();
}

test("questions, prefill and confirmation through the signed email link", async ({ page, browser }) => {
  const { hostEmail, username } = await setupHost(page);
  // New event types come with the 24-hour reminder (NTF-006).
  await expect(page.getByText("24-hour reminder")).toBeVisible();

  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Company");
  await page.getByLabel("Identifier").fill("company");
  await page.getByLabel("Required").check();
  await page.getByLabel("Requires confirmation").check();
  await save(page);
  await expectAccessible(page);

  const context = await browser.newContext({ timezoneId: "Europe/Istanbul", locale: "en-GB" });
  const guest = await context.newPage();
  const email = uniqueEmail("prefill");
  await guest.goto(`/${username}/intro-call?name=Pat%20Prefill&email=${encodeURIComponent(email)}&company=ACME&utm_source=newsletter`);
  await pickFirstAvailableDay(guest);
  await (await firstSlotButton(guest)).click();
  await expect(guest.getByLabel("Your name")).toHaveValue("Pat Prefill");
  await expect(guest.getByLabel("Email")).toHaveValue(email);
  await expect(guest.getByLabel("Company")).toHaveValue("ACME");
  await guest.getByRole("button", { name: "Request booking" }).click();
  await expect(guest.getByRole("heading", { name: "Waiting for the host to confirm" })).toBeVisible();
  await expectAccessible(guest);

  await waitForEmail(email, /^Booking requested: /);
  const acceptUrl = await waitForEmailLink(hostEmail, /^New booking request: /, /https?:\/\/[^\s)\]]+\/decide\?action=accept[^\s)\]]+/);
  await context.close();
  // Opening the link changes nothing; the host confirms on the page (link scanners are harmless).
  // It works without a session: open it in a fresh context. The dev server may abort the very
  // first navigation to a not-yet-compiled route, hence one retry.
  const inbox = await browser.newContext();
  const decide = await inbox.newPage();
  await decide.goto(acceptUrl).catch(() => decide.goto(acceptUrl));
  await expect(decide.getByText(`Pat Prefill (${email})`)).toBeVisible();
  await decide.getByRole("button", { name: "Accept" }).click();
  await expect(decide.getByText("Accepted. The invitee has been notified.")).toBeVisible();
  await expectAccessible(decide);
  await inbox.close();
  const confirmed = await waitForEmail(email, /^Confirmed: /);
  expect(confirmed.text).toMatch(/Your booking was confirmed/i);

  await page.goto("/bookings");
  await expect(page.getByText("Company: ACME")).toBeVisible();
});

test("seats: a second booker joins the same time and sees the seats left", async ({ page, browser }) => {
  const { username } = await setupHost(page);
  await page.getByLabel("Seats per time slot").fill("2");
  await save(page);

  const book = async (label: string) => {
    const context = await browser.newContext({ timezoneId: "Europe/Istanbul", locale: "en-GB" });
    const guest = await context.newPage();
    await guest.goto(`/${username}/intro-call`);
    await pickFirstAvailableDay(guest);
    const slot = await firstSlotButton(guest);
    const text = (await slot.textContent()) ?? "";
    await slot.click();
    await guest.getByLabel("Your name").fill(label);
    await guest.getByLabel("Email").fill(uniqueEmail("seat"));
    await guest.getByRole("button", { name: "Confirm booking" }).click();
    await expect(guest.getByRole("heading", { name: "You are scheduled" })).toBeVisible();
    await context.close();
    return text;
  };
  expect(await book("Seat One")).toContain("2 seats left");
  expect(await book("Seat Two")).toContain("1 seat left");

  await page.goto("/bookings");
  await expect(page.getByText(/Intro call with Seat One/)).toHaveCount(1);
});

test("troubleshooter explains why times are unavailable (AVL-008)", async ({ page }) => {
  await setupHost(page);
  await page.goto("/availability/troubleshoot");
  await expect(page.getByRole("heading", { name: "Troubleshooter" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Outside your working hours|Too soon|Available/ }).first()).toBeVisible();
  await expectAccessible(page);
});
