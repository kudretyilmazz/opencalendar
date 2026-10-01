import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp, createNonce, frameAncestorsFor } from "@/lib/security/csp";

/**
 * Next.js 16 Proxy (formerly middleware). Runs on the Node.js runtime.
 * 1. Per-request CSP nonce (NFR-006). frame-ancestors is 'none' except for public booking pages
 *    requested with ?embed=1, which get the EMBED_ALLOWED_ORIGINS allow-list (EMB-005). The value
 *    is read straight from process.env (validated at startup by lib/env.ts; invalid fails closed).
 * 2. Server Action POSTs without Origin/Sec-Fetch-Site are refused (CSRF backstop).
 * 3. Optimistic auth redirect for dashboard routes: only checks that a session cookie exists;
 *    every page and action still validates the session server-side (requireUser).
 */

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/settings", "/event-types", "/availability", "/bookings", "/teams", "/routing-forms"];

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;

  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !getSessionCookie(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // CSRF backstop: Next.js rejects a Server Action whose Origin doesn't match the host, but lets
  // one without any Origin through. Browsers always send Origin (or Sec-Fetch-Site) on POST, so
  // a state-changing action request carrying neither is refused.
  if (request.method === "POST" && request.headers.has("next-action") && !request.headers.has("origin") && request.headers.get("sec-fetch-site") !== "same-origin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    frameAncestors: frameAncestorsFor(pathname, searchParams, process.env.EMBED_ALLOWED_ORIGINS),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // NFR-010: a correlation id per request (a valid one from the reverse proxy is kept).
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);
  // Lets the root layout drop page chrome (the source footer) inside the compact embed view.
  requestHeaders.set("x-opencal-embed", searchParams.get("embed") === "1" ? "1" : "0");
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Request-Id", requestId);
  // HSTS only for an https deployment (APP_URL is runtime config; next.config headers are not).
  if (process.env.APP_URL?.startsWith("https://")) response.headers.set("Strict-Transport-Security", "max-age=63072000");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
