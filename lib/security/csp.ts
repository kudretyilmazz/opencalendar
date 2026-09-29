/**
 * Content-Security-Policy for app pages (NFR-006). Scripts are nonce-based with 'strict-dynamic'
 * (see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Inline style
 * attributes are allowed because React and the theme switcher set them; they cannot execute code.
 *
 * Framing (EMB-005): every page sends `frame-ancestors 'none'` except public booking pages
 * requested in embed mode (`?embed=1`), which may be framed by the origins in
 * EMBED_ALLOWED_ORIGINS (default `*`, i.e. any http/https page). See docs/03-architecture/embeds.md.
 */

export const NO_FRAMING: readonly string[] = ["'none'"];
export const DEFAULT_EMBED_ANCESTORS: readonly string[] = ["*"];

export function buildCsp(nonce: string, options: { dev: boolean; frameAncestors?: readonly string[] }): string {
  const ancestors = options.frameAncestors?.length ? options.frameAncestors : NO_FRAMING;
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self'",
    `connect-src 'self'${options.dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://login.microsoftonline.com",
    `frame-ancestors ${ancestors.join(" ")}`,
  ];
  return directives.join("; ");
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * One allow-list entry: `*`, `'self'`, a scheme (`https:`), or an origin such as
 * `https://example.com`, `https://*.example.com` or `http://localhost:8080` (no path).
 */
const ANCESTOR_SOURCE = /^(?:\*|'self'|https?:|https?:\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::(?:\d{1,5}|\*))?)$/i;

export class EmbedOriginsError extends Error {
  constructor(public readonly invalid: readonly string[]) {
    super(`invalid entries: ${invalid.join(", ")} (expected origins like https://example.com, space-separated)`);
    this.name = "EmbedOriginsError";
  }
}

/**
 * Parses EMBED_ALLOWED_ORIGINS (space- or comma-separated). Unset/empty means `*`; `none`
 * disables embedding entirely. Throws EmbedOriginsError on anything that is not a plain origin,
 * so a typo can never inject another CSP directive.
 */
export function parseEmbedAllowedOrigins(raw: string | undefined): readonly string[] {
  const entries = (raw ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (entries.length === 0) return DEFAULT_EMBED_ANCESTORS;
  if (entries.length === 1 && (entries[0] === "none" || entries[0] === "'none'")) return NO_FRAMING;
  const invalid = entries.filter((entry) => !ANCESTOR_SOURCE.test(entry));
  if (invalid.length > 0) throw new EmbedOriginsError(invalid);
  return entries;
}

/** First path segments that belong to the app, never to a public booking page. */
const APP_PREFIXES = new Set([
  "dashboard", "settings", "event-types", "availability", "bookings", "login", "signup", "logout",
  "check-email", "forgot-password", "reset-password", "api", "admin", "embed", "_next", "teams",
  "routing-forms",
]);
const SEGMENT = /^[A-Za-z0-9_-]+$/;
/** A username, or a dynamic group "ada+bob" (TEAM-009). */
const PROFILE_SEGMENT = /^[A-Za-z0-9_-]+(?:\+[A-Za-z0-9_-]+)*$/;

/**
 * The pages the embed loader frames: `/[username]` and `/[username]/[slug]` (also groups
 * `/a+b/...`), `/team/[team]` and `/team/[team]/[slug]` (TEAM-001), `/forms/[id]` (RTE-006)
 * and `/booking/[uid]`.
 */
export function isPublicBookingPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || !segments.slice(1).every((s) => SEGMENT.test(s))) return false;
  const [first] = segments;
  if (first === "team") return segments.length >= 2 && segments.length <= 3;
  if (first === "booking" || first === "forms") return segments.length === 2;
  if (segments.length > 2 || !PROFILE_SEGMENT.test(first)) return false;
  return !APP_PREFIXES.has(first.toLowerCase());
}

/**
 * frame-ancestors for one request: the embed allow-list for public booking pages with
 * `embed=1`, `'none'` for everything else. An invalid allow-list fails closed.
 */
export function frameAncestorsFor(pathname: string, searchParams: URLSearchParams, allowedOrigins: string | undefined): readonly string[] {
  if (searchParams.get("embed") !== "1" || !isPublicBookingPath(pathname)) return NO_FRAMING;
  try {
    return parseEmbedAllowedOrigins(allowedOrigins);
  } catch {
    // Startup env validation (lib/env.ts) reports the bad value; never widen framing here.
    return NO_FRAMING;
  }
}
