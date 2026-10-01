import { describe, expect, it } from "vitest";
import { assetHeaders, checkAsset, sniffImage } from "./assets";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);

describe("sniffImage", () => {
  it("recognizes the supported formats by their magic bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP")]))).toBe("image/webp");
    expect(sniffImage(bytes(0, 0, 1, 0, 1, 0))).toBe("image/x-icon");
    expect(sniffImage(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("image/svg+xml");
    expect(sniffImage(text("﻿  <svg viewBox='0 0 1 1'/>"))).toBe("image/svg+xml");
  });

  it("rejects everything else, whatever the file is called", () => {
    expect(sniffImage(text("<html><svg></svg></html>"))).toBeNull();
    expect(sniffImage(text("GIF89a"))).toBeNull();
    expect(sniffImage(bytes())).toBeNull();
  });
});

describe("checkAsset", () => {
  it("accepts a PNG favicon", () => {
    expect(checkAsset("favicon", PNG)).toEqual({ ok: true, mimeType: "image/png" });
  });

  it("enforces per-kind types and sizes", () => {
    expect(checkAsset("apple_icon", text("<svg></svg>")).ok).toBe(false);
    expect(checkAsset("favicon", new Uint8Array(256 * 1024 + 1))).toMatchObject({ ok: false, message: expect.stringMatching(/too large/) });
    expect(checkAsset("logo", bytes())).toMatchObject({ ok: false });
  });
});

describe("assetHeaders", () => {
  const asset = { mimeType: "image/svg+xml", sha256: "a".repeat(64) };

  it("caches the requested current version for a year", () => {
    expect(assetHeaders(asset, "a".repeat(16))["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("revalidates unversioned or stale requests", () => {
    expect(assetHeaders(asset, null)["cache-control"]).toMatch(/max-age=60/);
    expect(assetHeaders(asset, "b".repeat(16))["cache-control"]).toMatch(/max-age=60/);
    expect(assetHeaders(asset, "a")["cache-control"]).toMatch(/max-age=60/);
  });

  it("sandboxes the image and forbids sniffing", () => {
    const headers = assetHeaders(asset, null);
    expect(headers["content-security-policy"]).toContain("sandbox");
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers.etag).toBe(`"${asset.sha256}"`);
  });
});
