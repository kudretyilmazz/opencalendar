import type { ResolvedSettings } from "./defaults";

export type FooterParts = { poweredBy: boolean; source: "link" | "about" } | null;

/**
 * What the page footer shows (ADM-011). The source link satisfies AGPL-3.0 §13; when an admin
 * hides it the footer points to /about instead, which always carries the link. With both parts
 * hidden there is no footer at all, and /about stays reachable directly.
 */
export function footerParts(settings: Pick<ResolvedSettings, "hidePoweredBy" | "hideSourceLink">): FooterParts {
  if (settings.hidePoweredBy && settings.hideSourceLink) return null;
  return { poweredBy: !settings.hidePoweredBy, source: settings.hideSourceLink ? "about" : "link" };
}
