import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, EmbedOriginsError, frameAncestorsFor, isPublicBookingPath, parseEmbedAllowedOrigins } from "./csp";

describe("buildCsp", () => {
  it("uses the nonce for scripts and forbids framing and plugins", () => {
    const csp = buildCsp("abc", { dev: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval and websockets only in development", () => {
    const csp = buildCsp("abc", { dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
  });

  it("uses the given frame ancestors (EMB-005)", () => {
    expect(buildCsp("abc", { dev: false, frameAncestors: ["https://a.example", "https://*.b.example"] })).toMatch(
      /frame-ancestors https:\/\/a\.example https:\/\/\*\.b\.example$/,
    );
    expect(buildCsp("abc", { dev: false, frameAncestors: [] })).toContain("frame-ancestors 'none'");
  });
});

describe("parseEmbedAllowedOrigins", () => {
  it("defaults to any origin", () => {
    expect(parseEmbedAllowedOrigins(undefined)).toEqual(["*"]);
    expect(parseEmbedAllowedOrigins("  ")).toEqual(["*"]);
  });

  it("parses space- or comma-separated origins and strips trailing slashes", () => {
    expect(parseEmbedAllowedOrigins("https://a.example/ https://*.b.example,http://localhost:8080")).toEqual([
      "https://a.example",
      "https://*.b.example",
      "http://localhost:8080",
    ]);
    expect(parseEmbedAllowedOrigins("'self' https:")).toEqual(["'self'", "https:"]);
  });

  it("supports disabling embeds", () => {
    expect(parseEmbedAllowedOrigins("none")).toEqual(["'none'"]);
  });

  it("rejects paths, directive injection and bare hosts", () => {
    expect(() => parseEmbedAllowedOrigins("https://a.example/path")).toThrow(EmbedOriginsError);
    expect(() => parseEmbedAllowedOrigins("https://a.example; script-src *")).toThrow(/script-src/);
    expect(() => parseEmbedAllowedOrigins("example.com")).toThrow(/example\.com/);
    expect(() => parseEmbedAllowedOrigins("javascript:")).toThrow(EmbedOriginsError);
  });
});

describe("isPublicBookingPath", () => {
  it.each(["/ada", "/ada/intro", "/booking/abc_123", "/team/acme", "/team/acme/intro", "/ada+bob/intro", "/forms/f_1"])("%s is a booking page", (path) => {
    expect(isPublicBookingPath(path)).toBe(true);
  });

  it.each(["/", "/dashboard", "/settings/profile", "/event-types/new", "/login", "/api/health", "/booking", "/ada/intro/x", "/embed.js", "/Bookings", "/teams/x", "/team", "/team/a/b/c", "/forms", "/routing-forms/x", "/ada+/x", "/a<b/x"])(
    "%s is not",
    (path) => {
      expect(isPublicBookingPath(path)).toBe(false);
    },
  );
});

describe("frameAncestorsFor", () => {
  const embed = new URLSearchParams("embed=1&theme=dark");

  it("allows framing only for booking pages in embed mode", () => {
    expect(frameAncestorsFor("/ada/intro", embed, undefined)).toEqual(["*"]);
    expect(frameAncestorsFor("/ada/intro", new URLSearchParams(), undefined)).toEqual(["'none'"]);
    expect(frameAncestorsFor("/dashboard", embed, undefined)).toEqual(["'none'"]);
    expect(frameAncestorsFor("/booking/uid1", embed, "https://a.example")).toEqual(["https://a.example"]);
  });

  it("fails closed on an invalid allow-list", () => {
    expect(frameAncestorsFor("/ada", embed, "not an origin")).toEqual(["'none'"]);
  });
});

describe("createNonce", () => {
  it("is unique per call", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
