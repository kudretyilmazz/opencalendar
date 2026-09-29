/**
 * Returns `target` only if it is a same-origin absolute path; otherwise `fallback`.
 * Blocks open redirects such as `//evil.com`, `/\evil.com`, `https://evil.com` and
 * control-character tricks.
 */
export function safeRedirectPath(target: unknown, fallback = "/dashboard"): string {
  if (typeof target !== "string" || target.length === 0 || target.length > 2048) return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;
  try {
    const base = "http://opencalendar.invalid";
    const url = new URL(target, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
