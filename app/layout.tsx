import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { THEME_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { getDb } from "@/db/client";
import { assetUrl } from "@/features/instance/defaults";
import { getInstanceSettings } from "@/features/instance/server/service";
import { themeCss } from "@/features/instance/theme/css";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Title, description and icons come from the instance branding (ADM-011). */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getInstanceSettings(getDb());
  return {
    title: { default: settings.appName, template: `%s · ${settings.appName}` },
    description: settings.description,
    icons: {
      icon: assetUrl(settings, "favicon"),
      ...(settings.assets.apple_icon && { apple: assetUrl(settings, "apple_icon") }),
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP nonce generated per request in proxy.ts; the inline theme script must carry it.
  const [requestHeaders, settings] = await Promise.all([headers(), getInstanceSettings(getDb())]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const instanceTheme = themeCss(settings.theme, settings.radius);
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-default-theme={settings.defaultTheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Set the theme before first paint (no flash). A plain inline script in this Server
            Component: next/script would re-render it on the client, which React warns about. */}
        <script id="theme-init" nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Instance brand colors; themeCss only ever emits validated #rrggbb values. */}
        {instanceTheme && <style id="instance-theme" nonce={nonce} dangerouslySetInnerHTML={{ __html: instanceTheme }} />}
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
