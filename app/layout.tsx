import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { THEME_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { SourceFooter } from "@/components/source-footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "OpenCalendar", template: "%s · OpenCalendar" },
  description: "Open-source scheduling you can host yourself.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP nonce generated per request in proxy.ts; the inline theme script must carry it.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const embedded = requestHeaders.get("x-opencal-embed") === "1";
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Set the theme before first paint (no flash). A plain inline script in this Server
            Component: next/script would re-render it on the client, which React warns about. */}
        <script id="theme-init" nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider>
          {children}
          {!embedded && <SourceFooter />}
        </ThemeProvider>
      </body>
    </html>
  );
}
