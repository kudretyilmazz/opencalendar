import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { devices, expect, type Frame, type Page, test } from "@playwright/test";
import { configureProfile, createEventType, signUpVerified } from "./helpers";

/**
 * Booking with as little scrolling as possible (BKG-002, EMB-001/002, NFR-018): the layout
 * follows the booker's own width, picking a day brings its times into view, and an inline embed
 * shrinks back when its content does.
 */

let server: Server;
let hostOrigin = "";
let hostHtml = "";
let calLink = "";

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

test.beforeEach(async ({ page }) => {
  if (calLink) return;
  await signUpVerified(page, "Rhea Responsive", "responsive");
  const username = `rhea${Date.now().toString(36)}`;
  await configureProfile(page, username, "UTC");
  await createEventType(page, "Intro call", { minNotice: "0" });
  calLink = `${username}/intro-call`;
});

const partner = (appOrigin: string, call: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Partner</title></head>
<body style="margin:0"><header style="height:60px">Partner site</header><div id="cal"></div>
<script src="${appOrigin}/embed.js"></script><script>${call}</script></body></html>`;

const DAYS = 'section[aria-label="Choose a date"] [role=group] button:not([disabled])';
const TIMES = 'section[aria-label="Choose a time"] li button';

async function bookingFrame(page: Page): Promise<Frame> {
  const frame = await (await page.waitForSelector("iframe")).contentFrame();
  await frame!.waitForSelector('section[aria-label="Choose a date"][aria-busy="false"]', { timeout: 20_000 });
  return frame!;
}

/** True when the document needs no scrolling at all. */
const fits = (scope: Page | Frame) => scope.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);

test("on a small phone the calendar fits and picking a day brings its times into view", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone SE"], timezoneId: "UTC" });
  const phone = await context.newPage();
  await phone.goto(`/${calLink}`);
  await expect(phone.locator('section[aria-label="Choose a date"]')).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  expect(await fits(phone)).toBe(true);
  // Time zone and clock format fold into one line on a phone.
  await expect(phone.getByRole("button", { name: /UTC · (12h|24h)/ })).toBeVisible();

  await phone.locator(DAYS).first().tap();
  await expect(phone.locator(TIMES).first()).toBeInViewport();
  await context.close();
});

test("a popup in a laptop window shows the calendar and times without scrolling", async ({ browser, baseURL }) => {
  hostHtml = partner(new URL(baseURL!).origin, `OpenCalendar.popup({ calLink: "${calLink}" });`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: "UTC" });
  const page = await context.newPage();
  await page.goto(hostOrigin);
  const frame = await bookingFrame(page);
  await frame.locator(DAYS).first().click();
  await expect(frame.locator(TIMES).first()).toBeVisible();
  expect(await fits(frame)).toBe(true);
  await context.close();
});

test("an inline embed shrinks back when its content gets shorter", async ({ browser, baseURL }) => {
  hostHtml = partner(new URL(baseURL!).origin, `OpenCalendar.inline({ calLink: "${calLink}", elementOrSelector: "#cal" });`);
  const context = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "UTC" });
  const page = await context.newPage();
  await page.goto(hostOrigin);
  const frame = await bookingFrame(page);
  const iframe = page.locator("#cal iframe");
  const height = async () => Math.round((await iframe.boundingBox())!.height);
  /** Where the booking card ends inside the iframe: the iframe should end there too, no gap. */
  const contentBottom = () => frame.evaluate(() => Math.ceil(document.querySelector("main")!.firstElementChild!.getBoundingClientRect().bottom));

  // Picking a day adds its times, and the iframe grows with them.
  const before = await height();
  await frame.locator(DAYS).first().tap();
  await expect(frame.locator(TIMES).first()).toBeVisible();
  await expect.poll(height).toBeGreaterThan(before);
  const withTimes = await height();

  // Another month clears the day: the times go away and the iframe shrinks back, leaving no gap.
  await frame.getByRole("button", { name: "Next month" }).tap();
  await expect(frame.locator(TIMES)).toHaveCount(0);
  await expect.poll(height).toBeLessThan(withTimes);
  await expect.poll(async () => (await height()) - (await contentBottom())).toBeLessThanOrEqual(2);
  await context.close();
});

test("on a phone the popup opens full screen with a reachable close button", async ({ browser, baseURL }) => {
  hostHtml = partner(new URL(baseURL!).origin, `OpenCalendar.popup({ calLink: "${calLink}" });`);
  const context = await browser.newContext({ ...devices["iPhone SE"], timezoneId: "UTC" });
  const page = await context.newPage();
  await page.goto(hostOrigin);
  await bookingFrame(page);
  const viewport = page.viewportSize()!;
  const box = (await page.getByRole("dialog", { name: "Book a meeting" }).boundingBox())!;
  expect([box.x, box.y, box.width, box.height].map(Math.round)).toEqual([0, 0, viewport.width, viewport.height]);
  const close = page.getByRole("button", { name: "Close" });
  await expect(close).toBeInViewport({ ratio: 1 });
  await close.tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.close();
});

test("a desktop popup fits its content instead of leaving empty space below it", async ({ browser, baseURL }) => {
  hostHtml = partner(new URL(baseURL!).origin, `OpenCalendar.popup({ calLink: "${calLink}" });`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "UTC" });
  const page = await context.newPage();
  await page.goto(hostOrigin);
  const frame = await bookingFrame(page);
  const dialog = page.getByRole("dialog", { name: "Book a meeting" });
  const contentBottom = () => frame.evaluate(() => Math.ceil(document.querySelector("main")!.firstElementChild!.getBoundingClientRect().bottom));
  await expect.poll(async () => Math.round((await dialog.boundingBox())!.height) - (await contentBottom())).toBeLessThanOrEqual(2);
  expect(await fits(frame)).toBe(true);
  await context.close();
});

test("on a phone the booking form is short and its button stays on screen", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone SE"], timezoneId: "UTC" });
  const phone = await context.newPage();
  await phone.goto(`/${calLink}`);
  await expect(phone.locator('section[aria-label="Choose a date"]')).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  await phone.locator(DAYS).first().tap();
  await phone.locator(TIMES).first().tap();
  await expect(phone.getByLabel("Your name")).toBeVisible();

  // Optional fields are folded until asked for.
  await expect(phone.getByLabel("Notes (optional)")).toHaveCount(0);
  await expect(phone.getByLabel("Guests (optional)")).toHaveCount(0);
  await phone.getByRole("button", { name: "Add a note" }).tap();
  await expect(phone.getByLabel("Notes (optional)")).toBeVisible();

  // The confirm button is on screen without scrolling, wherever the form is scrolled to.
  await phone.evaluate(() => window.scrollTo(0, 0));
  await expect(phone.getByRole("button", { name: "Confirm booking" })).toBeInViewport({ ratio: 1 });
  await context.close();
});
