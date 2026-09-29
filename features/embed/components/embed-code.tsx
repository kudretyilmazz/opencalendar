"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import { SNIPPET_FORMATS, type SnippetFormat } from "../snippets";

const FORMAT_LABELS: Record<SnippetFormat, string> = { html: "HTML", iframe: "iframe", link: "Link" };

const FORMAT_HINTS: Record<SnippetFormat, string> = {
  html: "Paste this where the booking page should appear. It loads the OpenCalendar script.",
  iframe: "A plain iframe for sites that don't allow scripts. Its height doesn't follow the page.",
  link: "A direct link for platforms that allow neither scripts nor iframes.",
};

/** The generated code, a format switch (HTML · iframe · Link) when `onFormat` is given, and "Copy code". */
export function EmbedCode({
  code,
  error,
  format,
  onFormat,
}: {
  code: string;
  error: string | null;
  format: SnippetFormat;
  /** Only inline embeds have iframe/link alternatives; leave out to hide the switch. */
  onFormat?: (format: SnippetFormat) => void;
}) {
  return (
    <section aria-label="Code" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onFormat ? (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Code format"
            value={format}
            onValueChange={(v) => v && onFormat(v as SnippetFormat)}
          >
            {SNIPPET_FORMATS.map((f) => (
              <ToggleGroupItem key={f} value={f} className="h-9 px-3 md:h-8">
                {FORMAT_LABELS[f]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <span />
        )}
        <CopyButton
          value={code}
          copiedMessage="Embed code copied to clipboard"
          disabled={!code}
          className="h-10 rounded-md px-3.5 text-sm md:h-9"
        >
          Copy code
        </CopyButton>
      </div>
      {onFormat && <p className="text-xs text-muted-foreground">{FORMAT_HINTS[format]}</p>}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-[13px] text-destructive">
          {error}
        </p>
      ) : (
        <pre
          tabIndex={0}
          aria-label="Embed code"
          className="max-h-52 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground"
        >
          <code>{code}</code>
        </pre>
      )}
    </section>
  );
}
