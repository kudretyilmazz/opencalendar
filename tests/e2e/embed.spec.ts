import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type FrameLocator, type Page, test } from "@playwright/test";
import { configureProfile, createEventType, pickOption, signUpVerified } from "./helpers";
import { uniqueEmail } from "./mailpit";

/**
 * Embed loader end to end (EMB-001…EMB-005): a third-party page on another origin loads
 * /embed.js, renders an inline booking page and opens a popup from a data attribute.
 */

type RecordedEvent = { type: string; data: Record<string, unknown> };
declare global {
  interface Window {
    __ocEvents: RecordedEvent[];
    __ocDomEvents: string[];
  }
}

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

function hostPage(appOrigin: string, calLink: string, prefillEmail: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Partner site</title></head>
<body>
  <h1>Partner site</h1>
  <button type="button" id="popup-trigger" data-opencalendar-link="${calLink}" data-opencalendar-config='{"theme":"dark"}'>Book via popup</button>
  <div id="inline-embed"></div>
  <script src="${appOrigin}/embed.js"></script>
  <script>
    window.__ocEvents = [];
    window.__ocDomEvents = [];
    OpenCalendar.on("*", function (e) { window.__ocEvents.push({ type: e.type, data: e.data }); });
    window.addEventListener("opencalendar:ready", function () { window.__ocDomEvents.push("ready"); });
    OpenCalendar.inline({
      calLink: "${calLink}",
      elementOrSelector: "#inline-embed",
      config: { name: "Eve Embed", email: "${prefillEmail}", theme: "light", brand: "#0f766e", layout: "month" },
    });
    OpenCalendar.floatingButton({ calLink: "${calLink}", text: "Schedule a call", color: "#0f766e", position: "bottom-left" });
  </script>
</body></html>`;
}

const events = (page: Page, type: string) =>
  page.evaluate((t) => window.__ocEvents.filter((e) => e.type === t), type);

async function waitForEvent(page: Page, type: string, timeout = 20_000) {
  await page.waitForFunction((t) => window.__ocEvents.some((e) => e.type === t), type, { timeout });
  return (await events(page, type)).at(-1)!;
}

/** pickFirstAvailableDay/firstSlotButton from helpers.ts, but inside a frame. */
async function pickFirstSlot(frame: FrameLocator) {
  const calendar = frame.locator('section[aria-label="Choose a date"]');
  const available = calendar.getByRole("group", { name: "Days" }).locator("button:not([disabled])");
  for (let i = 0; i < 3; i++) {
    await expect(calendar).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
    if ((await available.count()) > 0) break;
    await frame.getByRole("button", { name: "Next month" }).click();
  }
  await available.first().click();
  const slot = frame.locator('section[aria-label="Choose a time"] li button').first();
  await expect(slot).toBeVisible();
  await slot.click();
}

test("embed loader: inline, popup, floating button, events and framing headers (EMB-001…005)", async ({ page, browser, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin;
  await signUpVerified(page, "Emma Embed", "embedhost");
  const username = `emma${Date.now().toString(36)}`;
  await configureProfile(page, username, "UTC");
  await createEventType(page, "Intro call", { minNotice: "0" });
  const calLink = `${username}/intro-call`;
  const bookerEmail = uniqueEmail("embedbooker");

  // EMB-005: booking pages are frameable only in embed mode; the dashboard never is.
  const embedHead = await page.request.get(`/${calLink}?embed=1`);
  expect(embedHead.headers()["content-security-policy"]).toMatch(/frame-ancestors \*($|;)/);
  expect(embedHead.headers()["x-frame-options"]).toBeUndefined();
  const plainHead = await page.request.get(`/${calLink}`);
  expect(plainHead.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(plainHead.headers()["x-frame-options"]).toBe("DENY");
  const dashboardHead = await page.request.get("/dashboard?embed=1");
  expect(dashboardHead.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  hostHtml = hostPage(appOrigin, calLink, bookerEmail);
  const guestContext = await browser.newContext({ timezoneId: "UTC" });
  const host = await guestContext.newPage();
  await host.goto(`${hostOrigin}/`);

  // EMB-001 + EMB-004: the inline iframe points at the booking page in embed mode with prefill.
  const inlineFrame = host.locator("#inline-embed iframe");
  await expect(inlineFrame).toHaveAttribute("title", /.+/);
  const src = new URL((await inlineFrame.getAttribute("src"))!);
  expect(src.origin + src.pathname).toBe(`${appOrigin}/${calLink}`);
  expect(Object.fromEntries(src.searchParams)).toMatchObject({ embed: "1", theme: "light", brand: "0f766e", name: "Eve Embed", email: bookerEmail });

  // EMB-003: protocol events arrive in the parent, via the JS API and as window CustomEvents.
  await waitForEvent(host, "ready");
  await expect.poll(() => host.evaluate(() => window.__ocDomEvents)).toContain("ready");

  // EMB-005: the iframe height follows dimensionsChanged.
  const dims = await waitForEvent(host, "dimensionsChanged");
  expect(dims.data.height).toEqual(expect.any(Number));
  await expect
    .poll(async () => {
      const last = (await events(host, "dimensionsChanged")).at(-1)!;
      const height = await inlineFrame.evaluate((el) => (el as HTMLIFrameElement).style.height);
      return height === `${Math.ceil(last.data.height as number)}px`;
    })
    .toBe(true);

  // EMB-002: floating button with configured text and position.
  const floating = host.getByRole("button", { name: "Schedule a call" });
  await expect(floating).toBeVisible();
  expect(await floating.evaluate((el) => (el as HTMLElement).style.left)).toBe("20px");

  // EMB-002: data-attribute popup is an accessible modal; Escape closes it and restores focus.
  const trigger = host.getByRole("button", { name: "Book via popup" });
  await trigger.click();
  const dialog = host.getByRole("dialog", { name: "Book a meeting" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.locator("iframe")).toHaveAttribute("src", /embed=1.*theme=dark|theme=dark.*embed=1/);
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  expect(await host.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await host.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await host.evaluate(() => document.body.style.overflow)).toBe("");

  // Complete a booking inside the inline iframe: the parent hears about each step.
  const frame = host.frameLocator("#inline-embed iframe");
  await pickFirstSlot(frame);
  const dateSelected = await waitForEvent(host, "dateSelected");
  expect(dateSelected.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const slotSelected = await waitForEvent(host, "slotSelected");
  // start/end: epoch milliseconds today; an ISO string would also satisfy the protocol docs.
  expect(Number.isNaN(new Date(slotSelected.data.start as string | number).getTime())).toBe(false);
  expect(Number.isNaN(new Date(slotSelected.data.end as string | number).getTime())).toBe(false);
  await expect(frame.getByLabel("Your name")).toHaveValue("Eve Embed");
  await expect(frame.getByLabel("Email")).toHaveValue(bookerEmail);
  await frame.getByRole("button", { name: "Confirm booking" }).click();
  const success = await waitForEvent(host, "bookingSuccessful", 30_000);
  expect(success.data).toMatchObject({ uid: expect.any(String), start: slotSelected.data.start, end: slotSelected.data.end });
  expect(await events(host, "bookingFailed")).toEqual([]);

  await guestContext.close();
});

// Not run by the author (no server available); follows the builder steps of routing-forms.spec.ts.
test("embed loader: a routing form embeds via forms/<id>, posts ready and auto-resizes (RTE-006)", async ({ page, browser, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin;
  await signUpVerified(page, "Rita Embed", "embedform");
  await page.goto("/routing-forms/new");
  await page.getByLabel("Name", { exact: true }).fill("Embedded qualify");
  await pickOption(page, page.locator("#newFieldType"), "Text");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.locator("#f-label-0").fill("Company");
  await page.locator("#f-key-0").fill("company");
  await pickOption(page, page.locator("#fallback-kind"), "A custom message");
  await page.locator("#fallback-message").fill("Thanks!");
  await page.getByRole("button", { name: "Save routing form" }).click();
  await expect(page).toHaveURL(/\/routing-forms\/(?!new$)[^/]+$/);
  const formId = new URL(page.url()).pathname.split("/").at(-1)!;

  const head = await page.request.get(`/forms/${formId}?embed=1`);
  expect(head.headers()["content-security-policy"]).toMatch(/frame-ancestors \*($|;)/);

  hostHtml = hostPage(appOrigin, `forms/${formId}`, "unused@example.com");
  const guestContext = await browser.newContext({ timezoneId: "UTC" });
  const host = await guestContext.newPage();
  await host.goto(`${hostOrigin}/`);

  const inlineFrame = host.locator("#inline-embed iframe");
  expect(new URL((await inlineFrame.getAttribute("src"))!).pathname).toBe(`/forms/${formId}`);
  await waitForEvent(host, "ready");
  const dims = await waitForEvent(host, "dimensionsChanged");
  expect(dims.data.height).toEqual(expect.any(Number));
  await expect
    .poll(async () => {
      const last = (await events(host, "dimensionsChanged")).at(-1)!;
      return (await inlineFrame.evaluate((el) => (el as HTMLIFrameElement).style.height)) === `${Math.ceil(last.data.height as number)}px`;
    })
    .toBe(true);
  await expect(host.frameLocator("#inline-embed iframe").getByLabel("Company")).toBeVisible();
  await guestContext.close();
});
