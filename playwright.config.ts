import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  // Everything runs in Chromium; the core flows (sign-up, booking, time zones, reschedule and
  // cancel) also run in Firefox and WebKit (Safari engine) for NFR-018.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /(foundation|scheduling)\.spec\.ts/ },
    // WebKit also covers the popup embed on an iPhone (NFR-018: iOS Safari).
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /(foundation|scheduling|embed-mobile)\.spec\.ts/ },
  ],
  // Reuses a running server locally; CI starts the production build (see .github/workflows/ci.yml).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${baseURL}/api/health/live`, reuseExistingServer: true, timeout: 120_000 },
});
