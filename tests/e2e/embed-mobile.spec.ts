import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { devices, expect, test } from "@playwright/test";
import { configureProfile, createEventType, signUpVerified } from "./helpers";

/**
 * The popup embed on a phone (EMB-002): a partner site opens the booking page in the popup and
 * the visitor books with taps (touch events, mobile viewport), not mouse clicks.
 */

let server: Server;
let hostOrigin = "";
let hostHtml = "";

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(hostHtml);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  hostOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const partnerSite = (appOrigin: string, calLink: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Partner site</title></head>
<body style="margin:0;font-family:sans-serif">
  <h1>Partner site</h1>
  <p style="height:1200px">Long page content…</p>
  <button type="button" id="popup-trigger" data-opencalendar-link="${calLink}">Book via popup</button>
  <button type="button" id="locked-trigger">Book from a modal</button>
  <script src="${appOrigin}/embed.js"></script>
  <script>
    // Like a Radix/Headless UI modal on the partner site: it locks the page with
    // body { pointer-events: none } and opens the booking popup before (or without) unlocking.
    document.getElementById("locked-trigger").addEventListener("click", function () {
      document.body.style.pointerEvents = "none";
      OpenCalendar.popup({ calLink: "${calLink}" });
    });
  </script>
</body></html>`;

for (const [name, device, trigger] of [
  ["iPhone (WebKit)", devices["iPhone 13"], "#popup-trigger"],
  ["Android (Chromium)", devices["Pixel 7"], "#popup-trigger"],
  ["iPhone, opened from a page that locks pointer events", devices["iPhone 13"], "#locked-trigger"],
  ["Android, opened from a page that locks pointer events", devices["Pixel 7"], "#locked-trigger"],
] as const) {
  test(`popup embed works with taps on a phone: ${name} (EMB-002)`, async ({ page, browser, baseURL, browserName }) => {
    test.skip(browserName !== device.defaultBrowserType, `runs in ${device.defaultBrowserType}`);
    const appOrigin = new URL(baseURL!).origin;
    await signUpVerified(page, "Mia Mobile", "mobilehost");
    const username = `mia${Date.now().toString(36)}`;
    await configureProfile(page, username, "UTC");
    await createEventType(page, "Intro call", { minNotice: "0" });
    hostHtml = partnerSite(appOrigin, `${username}/intro-call`);

    const context = await browser.newContext({ ...device, timezoneId: "UTC" });
    const phone = await context.newPage();
    await phone.goto(`${hostOrigin}/`);
    await phone.locator(trigger).tap();
    const dialog = phone.getByRole("dialog", { name: "Book a meeting" });
    await expect(dialog).toBeVisible();

    const frame = phone.frameLocator('[role="dialog"] iframe');
    const calendar = frame.locator('section[aria-label="Choose a date"]');
    await expect(calendar).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
    const days = calendar.getByRole("group", { name: "Days" }).locator("button:not([disabled])");
    if ((await days.count()) === 0) await frame.getByRole("button", { name: "Next month" }).tap();
    await days.first().tap({ timeout: 5_000 });
    const slot = frame.locator('section[aria-label="Choose a time"] li button').first();
    await expect(slot).toBeVisible();
    await slot.tap({ timeout: 5_000 });
    await expect(frame.getByLabel("Your name")).toBeVisible();
    await frame.getByLabel("Your name").tap({ timeout: 5_000 });

    // The close button is reachable and closes the popup.
    await phone.getByRole("button", { name: "Close" }).tap({ timeout: 5_000 });
    await expect(dialog).toHaveCount(0);
    await context.close();
  });
}
