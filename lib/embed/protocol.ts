/**
 * Embed postMessage protocol, version 1 (EMB-003). Messages from the booking iframe to the
 * host page look like `{ source: "opencalendar", version: 1, type, data }`. The loader script
 * (public/embed.js) only accepts messages whose origin is this instance's origin.
 */
export const EMBED_SOURCE = "opencalendar";
export const EMBED_VERSION = 1;

export const EMBED_EVENTS = ["ready", "dateSelected", "slotSelected", "bookingSuccessful", "bookingFailed", "dimensionsChanged"] as const;
export type EmbedEvent = (typeof EMBED_EVENTS)[number];

export type EmbedMessage = { source: typeof EMBED_SOURCE; version: typeof EMBED_VERSION; type: EmbedEvent; data: Record<string, unknown> };

/** Query parameters the booking page understands in embed mode (EMB-004). */
export const EMBED_PARAMS = ["embed", "theme", "brand", "hideDetails", "layout"] as const;
export type EmbedOptions = { theme: "light" | "dark" | "auto"; brand: string | null; hideDetails: boolean; layout: "month" | "column" };

export function parseEmbedOptions(params: Record<string, string | string[] | undefined>): EmbedOptions | null {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]?.[0] : params[k]) as string | undefined;
  if (one("embed") !== "1") return null;
  const theme = one("theme");
  const brand = one("brand");
  return {
    theme: theme === "light" || theme === "dark" ? theme : "auto",
    // Only plain hex colors: the value ends up in a style attribute.
    brand: brand && /^#?[0-9a-f]{6}$/i.test(brand) ? `#${brand.replace(/^#/, "")}` : null,
    hideDetails: one("hideDetails") === "1",
    layout: one("layout") === "column" ? "column" : "month",
  };
}
