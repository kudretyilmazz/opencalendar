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

/** Reports the document height whenever it changes, for auto-resizing iframes (EMB-005). */
export function watchDimensions(): () => void {
  if (!isEmbedded() || typeof ResizeObserver === "undefined") return () => undefined;
  let last = 0;
  const report = () => {
    const height = Math.ceil(document.documentElement.scrollHeight);
    if (height !== last) {
      last = height;
      emitEmbed("dimensionsChanged", { height });
    }
  };
  const observer = new ResizeObserver(report);
  observer.observe(document.body);
  report();
  return () => observer.disconnect();
}
