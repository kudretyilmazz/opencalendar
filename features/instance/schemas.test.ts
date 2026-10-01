import { describe, expect, it } from "vitest";
import { brandingSchema, emailSchema, platformSchema, themeSchema } from "./schemas";

describe("brandingSchema", () => {
  it("parses form data with checkboxes and blank optional text", () => {
    expect(brandingSchema.parse({ appName: "  Acme Meet ", description: "", hidePoweredBy: "on" })).toEqual({
      appName: "Acme Meet",
      description: null,
      hidePoweredBy: true,
      hideSourceLink: false,
    });
  });

  it("requires a single-line app name", () => {
    expect(brandingSchema.safeParse({ appName: "  " }).success).toBe(false);
    expect(brandingSchema.safeParse({ appName: "Acme\nBcc: x@evil.test" }).success).toBe(false);
  });
});

describe("themeSchema", () => {
  it("builds the stored palette from the filled fields only", () => {
    expect(themeSchema.parse({ lightPrimary: "#1D4ED8", darkHighlight: "#a5b4fc", radius: "1rem", defaultTheme: "dark" })).toEqual({
      theme: { light: { primary: "#1d4ed8" }, dark: { highlight: "#a5b4fc" } },
      radius: "1rem",
      defaultTheme: "dark",
    });
  });

  it("stores nothing when every color is blank", () => {
    expect(themeSchema.parse({ lightPrimary: "", radius: "default", defaultTheme: "system" })).toEqual({
      theme: {},
      radius: null,
      defaultTheme: "system",
    });
  });

  it("rejects colors that vanish into the background", () => {
    const result = themeSchema.safeParse({ lightPrimary: "#f5f5f5", darkPrimary: "#111111", defaultTheme: "system" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0]).toSorted()).toEqual(["darkPrimary", "lightPrimary"]);
  });

  it("rejects anything that is not #rrggbb and unknown radii", () => {
    expect(themeSchema.safeParse({ lightPrimary: "blue", defaultTheme: "system" }).success).toBe(false);
    expect(themeSchema.safeParse({ radius: "3px", defaultTheme: "system" }).success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("accepts a dark button color and rejects a pale one", () => {
    expect(emailSchema.parse({ emailButtonColor: "#1d4ed8", emailFooterText: "" })).toEqual({
      emailButtonColor: "#1d4ed8",
      emailFooterText: null,
    });
    expect(emailSchema.safeParse({ emailButtonColor: "#fef9c3" }).success).toBe(false);
  });
});

describe("platformSchema", () => {
  it("maps 'env' to null and parses optional defaults", () => {
    expect(
      platformSchema.parse({ signupMode: "env", defaultTimeZone: "Europe/Istanbul", defaultWeekStart: "1", defaultTimeFormat: "", oauthGoogleHidden: "on" }),
    ).toMatchObject({ signupMode: null, defaultTimeZone: "Europe/Istanbul", defaultWeekStart: 1, defaultTimeFormat: null, oauthGoogleHidden: true, oauthMicrosoftHidden: false });
  });

  it("rejects unknown time zones and week starts", () => {
    expect(platformSchema.safeParse({ signupMode: "open", defaultTimeZone: "Mars/Base" }).success).toBe(false);
    expect(platformSchema.safeParse({ signupMode: "open", defaultWeekStart: "3" }).success).toBe(false);
  });
});
