import { describe, expect, it } from "vitest";
import { MIN_VISIBLE_PX, shouldReveal } from "./reveal";

describe("shouldReveal", () => {
  it("scrolls to times that start below the screen", () => {
    expect(shouldReveal({ top: 700 }, 568)).toBe(true);
  });

  it("scrolls when only a sliver of the times is visible", () => {
    expect(shouldReveal({ top: 568 - MIN_VISIBLE_PX + 1 }, 568)).toBe(true);
  });

  it("leaves the page alone when the times are already in view", () => {
    expect(shouldReveal({ top: 300 }, 568)).toBe(false);
    expect(shouldReveal({ top: 568 - MIN_VISIBLE_PX }, 568)).toBe(false);
  });
});
