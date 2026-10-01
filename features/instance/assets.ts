import type { AssetKind } from "./defaults";

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/x-icon" | "image/svg+xml";

/** Upload limits per asset (ADM-011): favicons are small; logos may be larger. */
export const ASSET_RULES: Record<AssetKind, { maxBytes: number; types: readonly ImageMime[] }> = {
  favicon: { maxBytes: 256 * 1024, types: ["image/x-icon", "image/png", "image/svg+xml"] },
  apple_icon: { maxBytes: 256 * 1024, types: ["image/png"] },
  logo: { maxBytes: 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] },
  logo_dark: { maxBytes: 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] },
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

/**
 * The image type from the file's own bytes; the browser-sent type and file name are never
 * trusted. Returns null for anything that isn't one of the supported formats.
 */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--(?:[^-]|-(?!->))*-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

export type AssetCheck = { ok: true; mimeType: ImageMime } | { ok: false; message: string };

export function checkAsset(kind: AssetKind, bytes: Uint8Array): AssetCheck {
  const rule = ASSET_RULES[kind];
  if (bytes.byteLength === 0) return { ok: false, message: "Choose a file to upload." };
  if (bytes.byteLength > rule.maxBytes) return { ok: false, message: `The file is too large (max ${rule.maxBytes / 1024} KB).` };
  const mimeType = sniffImage(bytes);
  if (!mimeType || !rule.types.includes(mimeType)) {
    return { ok: false, message: `Unsupported file type. Use ${rule.types.map((t) => t.split("/")[1].replace("x-icon", "ico").replace("+xml", "")).join(", ")}.` };
  }
  return { ok: true, mimeType };
}

/**
 * Response headers for a branding image. URLs carry `?v=<hash prefix>` (see assetUrl), so a
 * request for the current version is cached for a year; anything else revalidates quickly.
 * SVG is served under a sandboxing CSP so a script inside an uploaded logo can never run, even
 * when the image is opened directly.
 */
export function assetHeaders(asset: { mimeType: string; sha256: string }, requestedVersion: string | null): Record<string, string> {
  const current = requestedVersion !== null && asset.sha256.startsWith(requestedVersion) && requestedVersion.length >= 16;
  return {
    "content-type": asset.mimeType,
    "cache-control": current ? "public, max-age=31536000, immutable" : "public, max-age=60, must-revalidate",
    etag: `"${asset.sha256}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
}
