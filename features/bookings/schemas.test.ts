import { describe, expect, it } from "vitest";
import { bookerSchema, slotsQuerySchema } from "./schemas";

describe("booking schemas", () => {
  it("canonicalizes locales and falls back to en for invalid tags", () => {
    const base = { name: "A", email: "A@Example.com", timeZone: "UTC" };
    expect(bookerSchema.parse({ ...base, locale: "en-us" })).toMatchObject({ locale: "en-US", email: "a@example.com" });
    expect(bookerSchema.parse({ ...base, locale: "x_y" }).locale).toBe("en");
    expect(bookerSchema.safeParse({ ...base, timeZone: "Mars/Base" }).success).toBe(false);
  });

  it("limits the slots window to 45 days", () => {
    const q = { username: "a", slug: "b", duration: "30", start: "0" };
    expect(slotsQuerySchema.safeParse({ ...q, end: String(45 * 86_400_000) }).success).toBe(true);
    expect(slotsQuerySchema.safeParse({ ...q, end: String(46 * 86_400_000) }).success).toBe(false);
    expect(slotsQuerySchema.safeParse({ ...q, end: "0" }).success).toBe(false);
  });
});
