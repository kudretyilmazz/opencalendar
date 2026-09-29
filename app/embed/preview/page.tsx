import type { Metadata } from "next";
import { headers } from "next/headers";
import { PreviewHost } from "@/features/embed/components/preview-host";
import { parsePreviewParams } from "@/features/embed/options";

export const metadata: Metadata = { title: "Embed preview", robots: { index: false, follow: false } };

/**
 * The embed builder's live preview (features/embed/components/embed-dialog.tsx frames it): a
 * sample host page running /embed.js with the settings from the query. Every parameter is
 * validated against the builder's allow-lists (calLink shape, option values); anything else
 * falls back to defaults or shows an error. Only this app may frame it (lib/security/csp.ts);
 * the builder adds `embed=1` so next.config.ts leaves out `X-Frame-Options: DENY`.
 */
export default async function EmbedPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const preview = parsePreviewParams(await searchParams);
  // CSP nonce from proxy.ts, for the loader script the preview adds.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  if (!preview) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <p role="alert" className="text-sm text-muted-foreground">
          This preview link is not valid.
        </p>
      </main>
    );
  }

  return (
    <PreviewHost
      calLink={preview.calLink}
      kind={preview.calLink.startsWith("forms/") ? "form" : "eventType"}
      mode={preview.mode}
      options={preview.options}
      nonce={nonce}
    />
  );
}
