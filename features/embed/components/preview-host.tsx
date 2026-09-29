"use client";

import { useEffect, useRef, useState } from "react";
import type { EmbedMode, EmbedOptions } from "../options";
import { embedConfig, type FloatingButtonArgs, floatingButtonArgs } from "../snippets";
import type { EmbedTarget } from "../target";

type Loader = { floatingButton: (args: FloatingButtonArgs) => { remove: () => void } };
type LoaderWindow = Window & { OpenCalendar?: Loader };

const LOADER_ID = "opencalendar-loader";

/**
 * Loads /embed.js once, after hydration: the loader's auto-init changes the DOM (it fills
 * [data-opencalendar-inline]), which must not happen before React has hydrated this page.
 * Scripts added by an already-trusted script are allowed by 'strict-dynamic'; the nonce is set
 * as well so the tag also passes a nonce-only policy.
 */
function loadLoader(nonce: string | undefined, onLoad: () => void, onError: () => void): () => void {
  const w = window as LoaderWindow;
  if (w.OpenCalendar) {
    onLoad();
    return () => {};
  }
  let script = document.getElementById(LOADER_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = LOADER_ID;
    script.src = "/embed.js";
    script.async = true;
    if (nonce) script.nonce = nonce;
    document.body.appendChild(script);
  }
  const s = script;
  s.addEventListener("load", onLoad);
  s.addEventListener("error", onError);
  return () => {
    s.removeEventListener("load", onLoad);
    s.removeEventListener("error", onError);
  };
}

function Bar({ className }: { className: string }) {
  return <span aria-hidden className={`block rounded-full bg-muted ${className}`} />;
}

/**
 * The embed builder's preview: a neutral "your website" skeleton running the real loader with the
 * chosen settings, exactly as the generated snippet would (data attributes for inline and popup,
 * `OpenCalendar.floatingButton` for the floating button).
 */
export function PreviewHost({
  calLink,
  kind,
  mode,
  options,
  nonce,
}: {
  calLink: string;
  kind: EmbedTarget["kind"];
  mode: EmbedMode;
  options: EmbedOptions;
  nonce?: string;
}) {
  const [failed, setFailed] = useState(false);
  // The page reloads for every settings change, so these props never change after mount.
  const initial = useRef({ calLink, kind, mode, options });

  useEffect(() => {
    const { calLink: link, kind: k, mode: m, options: o } = initial.current;
    let removeButton: (() => void) | undefined;
    const onLoad = () => {
      const loader = (window as LoaderWindow).OpenCalendar;
      if (m !== "floating" || !loader || removeButton) return;
      removeButton = loader.floatingButton(floatingButtonArgs({ kind: k, calLink: link }, o)).remove;
    };
    const detach = loadLoader(nonce, onLoad, () => setFailed(true));
    return () => {
      detach();
      removeButton?.();
    };
  }, [nonce]);

  const config = JSON.stringify(embedConfig({ kind }, options));
  const hasConfig = config !== "{}";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-6 rounded-md bg-muted" />
          <span className="text-sm font-semibold">Your website</span>
        </span>
        <span aria-hidden className="flex gap-3">
          <Bar className="h-2.5 w-12" />
          <Bar className="h-2.5 w-12" />
          <Bar className="h-2.5 w-12" />
        </span>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-5 py-6">
        {failed && (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            The embed script could not be loaded.
          </p>
        )}
        <div aria-hidden className="flex flex-col gap-2.5">
          <Bar className="h-4 w-2/3" />
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-5/6" />
        </div>
        {mode === "inline" && (
          <div
            data-opencalendar-inline={calLink}
            data-opencalendar-config={hasConfig ? config : undefined}
            style={{ width: options.width, height: options.height, overflow: "auto" }}
            className="max-w-full rounded-md border border-dashed border-border"
          />
        )}
        {mode === "popup" && (
          <div>
            <button
              type="button"
              data-opencalendar-link={calLink}
              data-opencalendar-config={hasConfig ? config : undefined}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {options.buttonText}
            </button>
          </div>
        )}
        <div aria-hidden className="flex flex-col gap-2.5">
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-4/5" />
          <Bar className="h-2.5 w-3/5" />
        </div>
      </main>
    </div>
  );
}
