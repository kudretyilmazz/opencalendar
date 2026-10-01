import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Single self-contained server for the Docker image (docs/03-architecture/self-hosting.md).
  output: "standalone",
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pg-boss", "pg", "nodemailer"],
  // Branding uploads (ADM-011) go through Server Actions: logos up to 1 MB plus multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  // Browsers and crawlers still ask for /favicon.ico directly; serve the instance's favicon.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/api/branding/favicon" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // X-Frame-Options cannot express an allow-list, so embed responses (?embed=1) rely on the
      // CSP frame-ancestors set per request in proxy.ts (EMB-005); everything else also gets DENY.
      { source: "/:path*", missing: [{ type: "query", key: "embed", value: "1" }], headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
