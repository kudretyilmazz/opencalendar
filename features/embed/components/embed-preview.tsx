"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useDebounced } from "./hooks";

const RELOAD_DELAY_MS = 400;

/**
 * Live preview: the preview route (app/embed/preview) in an iframe, a fake host page that runs the
 * real /embed.js with the current settings. The URL is debounced so typing doesn't reload it on
 * every keystroke.
 */
export function EmbedPreview({ url, label }: { url: string; label: string }) {
  const src = useDebounced(url, RELOAD_DELAY_MS);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loading = loadedSrc !== src;

  return (
    <section
      aria-label="Preview"
      className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-muted"
    >
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-3">
        <span aria-hidden className="size-2.5 rounded-full bg-border" />
        <span aria-hidden className="size-2.5 rounded-full bg-border" />
        <span aria-hidden className="size-2.5 rounded-full bg-border" />
        <span className="ml-2 truncate text-xs text-muted-foreground">Preview on a sample page</span>
        {loading && <Spinner className="ml-auto size-3.5 text-muted-foreground" />}
      </div>
      {/* A new element per URL: changing an iframe's src would add entries to the tab's history. */}
      <iframe
        key={src}
        src={src}
        title={`Preview of the ${label} embed`}
        onLoad={() => setLoadedSrc(src)}
        className="h-[360px] w-full bg-background md:h-[400px]"
      />
    </section>
  );
}
