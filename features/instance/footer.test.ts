import { describe, expect, it } from "vitest";
import { footerParts } from "./footer";

describe("footerParts (ADM-011)", () => {
  it("shows powered-by and the source link by default", () => {
    expect(footerParts({ hidePoweredBy: false, hideSourceLink: false })).toEqual({ poweredBy: true, source: "link" });
  });

  it("drops only the powered-by text", () => {
    expect(footerParts({ hidePoweredBy: true, hideSourceLink: false })).toEqual({ poweredBy: false, source: "link" });
  });

  it("points to /about when the source link is hidden", () => {
    expect(footerParts({ hidePoweredBy: false, hideSourceLink: true })).toEqual({ poweredBy: true, source: "about" });
  });

  it("renders nothing when both are hidden", () => {
    expect(footerParts({ hidePoweredBy: true, hideSourceLink: true })).toBeNull();
  });
});
