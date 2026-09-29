import { describe, expect, it } from "vitest";
import { EMBED_PREVIEW_PATH as CSP_PREVIEW_PATH, frameAncestorsFor } from "@/lib/security/csp";
import { isValidCalLink } from "./cal-link";
import {
  clampHeight,
  cleanEmail,
  DEFAULT_EMBED_OPTIONS,
  EMBED_PREVIEW_PATH,
  normalizeHex,
  normalizeWidth,
  parsePreviewParams,
  previewUrl,
  sanitizeEmbedOptions,
} from "./options";

describe("isValidCalLink", () => {
  it.each(["erin", "erin/intro", "erin+olga/intro", "team/robin", "team/robin/discovery", "forms/f_1-2", "a-b_c"])(
    "accepts %s",
    (link) => {
      expect(isValidCalLink(link)).toBe(true);
    },
  );

  it.each([
    "",
    "/erin",
    "erin/",
    "erin/intro/x",
    "team/a/b/c",
    "forms/a/b",
    "../x",
    "https://evil.example",
    "erin?x=1",
    "e rin",
    "erin+/x",
    "é",
    42,
    null,
    "a".repeat(301),
  ])("rejects %s", (link) => {
    expect(isValidCalLink(link)).toBe(false);
  });
});

describe("option normalizers", () => {
  it("accepts 6-digit hex colors only", () => {
    expect(normalizeHex("#0F766E")).toBe("#0f766e");
    expect(normalizeHex("0f766e")).toBe("#0f766e");
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#0f766e;background:url(x)")).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
  });

  it("accepts percentage or pixel widths", () => {
    expect(normalizeWidth("100%")).toBe("100%");
    expect(normalizeWidth("80%")).toBe("80%");
    expect(normalizeWidth("600px")).toBe("600px");
    expect(normalizeWidth("101%")).toBeNull();
    expect(normalizeWidth("0%")).toBeNull();
    expect(normalizeWidth("600")).toBeNull();
    expect(normalizeWidth("calc(100%)")).toBeNull();
  });

  it("clamps the height", () => {
    expect(clampHeight(10)).toBe(300);
    expect(clampHeight("5000")).toBe(2000);
    expect(clampHeight("700")).toBe(700);
    expect(clampHeight("abc")).toBe(640);
  });

  it("keeps plausible emails only", () => {
    expect(cleanEmail(" eve@example.com ")).toBe("eve@example.com");
    expect(cleanEmail("eve")).toBe("");
    expect(cleanEmail("<a>@b")).toBe("");
  });
});

describe("sanitizeEmbedOptions", () => {
  it("falls back to defaults for anything outside the allow-lists", () => {
    expect(sanitizeEmbedOptions({ theme: "neon", layout: "grid", buttonPosition: "top", hideDetails: "yes" })).toEqual(
      DEFAULT_EMBED_OPTIONS,
    );
  });

  it("keeps valid values and cleans text", () => {
    const o = sanitizeEmbedOptions({
      theme: "dark",
      layout: "week",
      hideDetails: "1",
      name: "  Eve\u0000 ",
      buttonText: "x".repeat(100),
    });
    expect(o.theme).toBe("dark");
    expect(o.layout).toBe("week");
    expect(o.hideDetails).toBe(true);
    expect(o.name).toBe("Eve");
    expect(o.buttonText).toHaveLength(60);
  });

  it("uses the default button text when the text is blank", () => {
    expect(sanitizeEmbedOptions({ buttonText: "   " }).buttonText).toBe("Book a meeting");
  });
});

describe("preview URL", () => {
  it("points at the path the CSP lets the dashboard frame", () => {
    expect(EMBED_PREVIEW_PATH).toBe(CSP_PREVIEW_PATH);
    const url = new URL(previewUrl({ calLink: "ada", mode: "inline", options: DEFAULT_EMBED_OPTIONS }), "http://x");
    expect(frameAncestorsFor(url.pathname, url.searchParams, "https://a.example")).toEqual(["'self'"]);
    // embed=1 keeps next.config.ts from sending X-Frame-Options: DENY.
    expect(url.searchParams.get("embed")).toBe("1");
  });

  it("writes only non-default options and always embed=1", () => {
    expect(previewUrl({ calLink: "ada/intro", mode: "inline", options: DEFAULT_EMBED_OPTIONS })).toBe(
      "/embed/preview?calLink=ada%2Fintro&mode=inline&embed=1",
    );
    const url = previewUrl({
      calLink: "ada/intro",
      mode: "floating",
      options: {
        ...DEFAULT_EMBED_OPTIONS,
        theme: "dark",
        brand: "#0f766e",
        buttonText: "Hi",
        buttonPosition: "bottom-left",
        hideDetails: true,
      },
    });
    expect(url).toBe(
      "/embed/preview?calLink=ada%2Fintro&mode=floating&theme=dark&brand=%230f766e&hideDetails=1&text=Hi&position=bottom-left&embed=1",
    );
  });

  it("round-trips through parsePreviewParams", () => {
    const options = {
      ...DEFAULT_EMBED_OPTIONS,
      layout: "column" as const,
      email: "eve@example.com",
      width: "80%",
      height: 900,
      buttonColor: "#112233",
    };
    const url = previewUrl({ calLink: "team/acme/intro", mode: "popup", options });
    const params = Object.fromEntries(new URL(url, "http://x").searchParams);
    expect(parsePreviewParams(params)).toEqual({ calLink: "team/acme/intro", mode: "popup", options });
  });

  it("rejects a bad calLink or mode and sanitizes the rest", () => {
    expect(parsePreviewParams({ calLink: "https://evil.example", mode: "inline" })).toBeNull();
    expect(parsePreviewParams({ calLink: "ada", mode: "modal" })).toBeNull();
    expect(parsePreviewParams({ mode: "inline" })).toBeNull();
    const parsed = parsePreviewParams({ calLink: ["ada", "evil"], mode: "inline", brand: "red", text: "<b>x</b>" });
    expect(parsed?.calLink).toBe("ada");
    expect(parsed?.options.brand).toBeNull();
    expect(parsed?.options.buttonText).toBe("<b>x</b>");
  });
});
