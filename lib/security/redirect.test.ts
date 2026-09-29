import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it.each(["/dashboard", "/settings/profile?tab=1", "/a/b#section"])("allows same-origin path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/\tevil",
    "/foo\\bar",
    "",
    undefined,
    ["/dashboard"],
    `/${"a".repeat(3000)}`,
  ])("falls back for %j", (target) => {
    expect(safeRedirectPath(target)).toBe("/dashboard");
  });

  it("uses a custom fallback", () => {
    expect(safeRedirectPath("//x", "/")).toBe("/");
  });
});
