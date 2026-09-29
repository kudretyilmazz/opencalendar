import { defineConfig, devices } from "@playwright/test";

/**
 * README screenshots (`npm run screenshots`): signs up a demo account on the local dev stack
 * (`npm run services:up`), fills it with scripts/screenshots/seed.ts and writes docs/images/*.png.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  workers: 1,
  timeout: 300_000,
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    colorScheme: "light",
    locale: "en-US",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${baseURL}/api/health/live`, reuseExistingServer: true, timeout: 120_000, cwd: "../.." },
});
