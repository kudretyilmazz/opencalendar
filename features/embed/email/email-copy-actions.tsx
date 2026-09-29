"use client";

import { Check, Code, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type CopyKind = "email" | "html";

type Feedback = { kind: CopyKind; ok: boolean; message: string };

/** Rich copy: HTML + plain text, so it pastes formatted into Gmail/Outlook. Falls back to text. */
async function copyRich(html: string, text: string): Promise<"rich" | "text"> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return "rich";
    } catch {
      // Some browsers refuse text/html items; the plain-text copy below still works.
    }
  }
  await navigator.clipboard.writeText(text);
  return "text";
}

type EmailCopyActionsProps = { html: string; text: string; disabled: boolean };

/** "Copy for email" and "Copy HTML" with a confirmation announced to screen readers. */
export function EmailCopyActions({ html, text, disabled }: EmailCopyActionsProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const run = async (kind: CopyKind) => {
    try {
      if (kind === "html") {
        await navigator.clipboard.writeText(html);
        setFeedback({ kind, ok: true, message: "HTML copied to clipboard" });
      } else {
        const how = await copyRich(html, text);
        setFeedback({ kind, ok: true, message: how === "rich" ? "Copied. Paste it into your email." : "Copied as plain text." });
      }
    } catch {
      setFeedback({ kind, ok: false, message: "Couldn't access the clipboard. Check the browser's clipboard permission." });
    }
  };

  const copied = (kind: CopyKind) => feedback?.kind === kind && feedback.ok;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10 rounded-md px-4" disabled={disabled} onClick={() => void run("email")}>
          {copied("email") ? <Check aria-hidden /> : <Mail aria-hidden />}
          {copied("email") ? "Copied" : "Copy for email"}
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-md px-4" disabled={disabled} onClick={() => void run("html")}>
          {copied("html") ? <Check aria-hidden /> : <Code aria-hidden />}
          {copied("html") ? "Copied" : "Copy HTML"}
        </Button>
      </div>
      <p aria-live="polite" className={feedback && !feedback.ok ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {feedback?.message ?? ""}
      </p>
    </div>
  );
}
