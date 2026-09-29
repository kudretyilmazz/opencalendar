"use client";

import { Check, Copy } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type CopyButtonProps = Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  value: string;
  /** Visible text; leave out for an icon-only button (then pass `aria-label`). */
  children?: ReactNode;
  iconClassName?: string;
};

/** Copies `value` to the clipboard and confirms with a check mark for two seconds. */
export function CopyButton({ value, children, iconClassName = "size-4", "aria-label": ariaLabel, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const Icon = copied ? Check : Copy;
  return (
    <Button
      type="button"
      aria-label={ariaLabel && copied ? "Copied" : ariaLabel}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard access denied (insecure context or permissions): leave the button as it was.
        }
      }}
      {...props}
    >
      <Icon className={iconClassName} aria-hidden />
      {children && (copied ? "Copied" : children)}
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </Button>
  );
}
