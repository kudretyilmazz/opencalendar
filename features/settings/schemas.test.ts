import { describe, expect, it } from "vitest";
import { profileSettingsSchema } from "./schemas";

const valid = {
  name: "Ada Lovelace",
  username: "ada",
  timeZone: "Europe/Istanbul",
  locale: "tr",
  weekStart: "1",
  timeFormat: "24",
  theme: "dark",
};

describe("profileSettingsSchema (ADM-005)", () => {
  it("accepts valid settings and coerces numbers", () => {
    expect(profileSettingsSchema.parse(valid)).toEqual({
      ...valid,
      weekStart: 1,
      timeFormat: 24,
      allowDynamicGroup: false,
    });
  });

  it("reads the group-link opt-in checkbox (TEAM-009)", () => {
    expect(profileSettingsSchema.parse({ ...valid, allowDynamicGroup: "on" }).allowDynamicGroup).toBe(true);
    expect(profileSettingsSchema.parse(valid).allowDynamicGroup).toBe(false);
    expect(profileSettingsSchema.safeParse({ ...valid, allowDynamicGroup: "yes" }).success).toBe(false);
  });

  it("normalizes the username to lowercase and trims the name", () => {
    const parsed = profileSettingsSchema.parse({ ...valid, username: "Ada-L", name: "  Ada  " });
    expect(parsed.username).toBe("ada-l");
    expect(parsed.name).toBe("Ada");
  });

  it.each(["a", "has space", "-leading", "trailing-", "x".repeat(40), "admin", "api", "dashboard"])(
    "rejects username %j",
    (username) => {
      expect(profileSettingsSchema.safeParse({ ...valid, username }).success).toBe(false);
    },
  );

  it("rejects unknown time zones", () => {
    expect(profileSettingsSchema.safeParse({ ...valid, timeZone: "Mars/Olympus" }).success).toBe(false);
  });

  it("accepts UTC", () => {
    expect(profileSettingsSchema.safeParse({ ...valid, timeZone: "UTC" }).success).toBe(true);
  });

  it("rejects unsupported locale, week start, time format and theme", () => {
    for (const patch of [{ locale: "fr" }, { weekStart: "3" }, { timeFormat: "13" }, { theme: "neon" }]) {
      expect(profileSettingsSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});
