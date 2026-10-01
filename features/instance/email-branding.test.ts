import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { DEFAULT_EMAIL_BRANDING, emailBranding, emailFooter } from "./email-branding";

describe("emailBranding", () => {
  it("keeps today's OpenCalendar look by default", () => {
    expect(DEFAULT_EMAIL_BRANDING).toMatchObject({
      appName: "OpenCalendar",
      logoUrl: null,
      buttonColor: "#111827",
      buttonTextColor: "#ffffff",
      bookingFooter: "Sent by OpenCalendar on behalf of your host.",
    });
  });

  it("uses the app name, a custom footer and an absolute raster logo URL", () => {
    const branding = emailBranding(
      { ...DEFAULT_SETTINGS, appName: "Acme Meet", emailFooterText: "Acme Inc., 1 Main St", emailButtonColor: "#fde68a", assets: { logo: { sha256: "f".repeat(64), mimeType: "image/png" } } },
      "https://cal.acme.test",
    );
    expect(branding).toMatchObject({
      appName: "Acme Meet",
      logoUrl: `https://cal.acme.test/api/branding/logo?v=${"f".repeat(16)}`,
      buttonTextColor: "#0f172a",
      accountFooter: "Acme Inc., 1 Main St",
      bookingFooter: "Acme Inc., 1 Main St",
    });
  });

  it("leaves out SVG logos", () => {
    const branding = emailBranding({ ...DEFAULT_SETTINGS, assets: { logo: { sha256: "a".repeat(64), mimeType: "image/svg+xml" } } }, "https://x.test");
    expect(branding.logoUrl).toBeNull();
  });

  it("names the app in the default footers", () => {
    expect(emailFooter({ appName: "Acme", emailFooterText: null }, "account")).toMatch(/^Sent by Acme\./);
  });
});
