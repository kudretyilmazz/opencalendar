"use client";

import { EMBED_SOURCE, EMBED_VERSION, type EmbedEvent, type EmbedMessage } from "./protocol";

/** True when the page runs inside an iframe (the embed). */
export const isEmbedded = () => typeof window !== "undefined" && window.parent !== window;

/**
 * Sends a protocol message to the embedding page (EMB-003). The target origin is "*" because
 * the embedding site is unknown; messages never carry secrets (no manage tokens).
 */
export function emitEmbed(type: EmbedEvent, data: Record<string, unknown> = {}): void {
  if (!isEmbedded()) return;
  const message: EmbedMessage = { source: EMBED_SOURCE, version: EMBED_VERSION, type, data };
  window.parent.postMessage(message, "*");
}

/**
 * The embedded content's own height: from the top of `root` to the bottom of its lowest child,
 * plus the root's bottom padding. Not `scrollHeight`: inside an iframe that never drops below the
 * iframe's current height, and the page's <main>/<body> stretch to fill it (flex-1, min-h-full),
 * so an auto-height iframe could grow but never shrink back (e.g. from calendar + times to the
 * shorter booking form), leaving a gap on the host page.
 */
export function contentHeight(root: Element): number {
  const top = root.getBoundingClientRect().top;
  let bottom = top;
  for (const child of Array.from(root.children)) {
    const position = getComputedStyle(child).position;
    if (position === "fixed" || position === "absolute") continue;
    bottom = Math.max(bottom, child.getBoundingClientRect().bottom + Number.parseFloat(getComputedStyle(child).marginBottom || "0"));
  }
  const padding = Number.parseFloat(getComputedStyle(root).paddingBottom || "0");
  return Math.ceil(bottom - top + padding);
}

/** Reports the content height whenever it changes, for auto-resizing iframes (EMB-005). */
export function watchDimensions(): () => void {
  if (!isEmbedded() || typeof ResizeObserver === "undefined") return () => undefined;
  // The page's <main> holds the content; it and the body only stretch to the iframe.
  const root = document.querySelector("main") ?? document.body;
  let last = 0;
  const report = () => {
    const height = contentHeight(root);
    if (height !== last) {
      last = height;
      emitEmbed("dimensionsChanged", { height });
    }
  };
  const observer = new ResizeObserver(report);
  const observeChildren = () => {
    for (const child of Array.from(root.children)) observer.observe(child);
  };
  observeChildren();
  // Children can be swapped (e.g. a result replacing the form); watch the new ones too.
  const mutations = new MutationObserver(() => {
    observeChildren();
    report();
  });
  mutations.observe(root, { childList: true });
  report();
  return () => {
    observer.disconnect();
    mutations.disconnect();
  };
}
