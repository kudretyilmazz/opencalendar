"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** Shows a freshly generated signing secret once, with a copy button. */
export function SecretNotice({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-accent p-3">
      <p className="text-sm font-medium">Signing secret (shown once)</p>
      <code className="break-all rounded bg-surface px-2 py-1 text-xs" aria-label="Signing secret">
        {secret}
      </code>
      <Button type="button" variant="secondary" className="h-8 self-start" onClick={copy}>
        {copied ? "Copied" : "Copy secret"}
      </Button>
    </div>
  );
}
