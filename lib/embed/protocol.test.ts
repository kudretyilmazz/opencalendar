import { describe, expect, it } from "vitest";
import { parseEmbedOptions } from "./protocol";

describe("parseEmbedOptions (EMB-004)", () => {
  it("is null outside embed mode and sanitizes options", () => {
    expect(parseEmbedOptions({})).toBeNull();
    expect(parseEmbedOptions({ embed: "1", theme: "dark", brand: "ff0000", hideDetails: "1", layout: "column" })).toEqual({
      theme: "dark",
      brand: "#ff0000",
      hideDetails: true,
      layout: "column",
    });
    expect(parseEmbedOptions({ embed: "1", layout: "week" })?.layout).toBe("week");
    expect(parseEmbedOptions({ embed: "1", layout: "month" })?.layout).toBe("month");
    expect(parseEmbedOptions({ embed: "1", layout: "grid" })?.layout).toBe("month");
    expect(parseEmbedOptions({ embed: "1", theme: "neon", brand: "red;background:url(x)" })).toEqual({ theme: "auto", brand: null, hideDetails: false, layout: "month" });
  });
});
