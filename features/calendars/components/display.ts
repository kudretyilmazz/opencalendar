/** Pure view helpers for the Calendars page (no server or browser APIs). */
import type { ConnectionView } from "../server/connections";

export type CalendarsSummary = {
  /** Calendars whose busy times block slots (on working connections). */
  checked: number;
  /** "Work · iCloud", or null when no destination calendar is set. */
  destination: string | null;
  connections: number;
  needsAttention: number;
};

export type AccountDisplay = {
  title: string;
  subtitle: string;
  /** Two-letter mark for the logo square. */
  mark: string;
};

const KNOWN_CALDAV_HOSTS: { match: RegExp; title: string; mark: string }[] = [
  { match: /icloud\.com$/i, title: "iCloud", mark: "iC" },
  { match: /fastmail\.com$/i, title: "Fastmail", mark: "Fm" },
  { match: /nextcloud/i, title: "Nextcloud", mark: "Nc" },
];

const PROVIDER_MARKS: Partial<Record<ConnectionView["provider"], string>> = { google: "G", microsoft: "Ms", zoom: "Zm" };

/** Strips the " · 1a2b3c4d" disambiguation hash the connect actions append to labels. */
const stripHash = (label: string) => label.replace(/ · [0-9a-f]{8}$/, "");

/** Title, subtitle and logo mark for a connected account. */
export function accountDisplay(conn: Pick<ConnectionView, "provider" | "providerName" | "label" | "calendars">): AccountDisplay {
  const label = stripHash(conn.label);
  if (conn.provider === "caldav") {
    const at = label.lastIndexOf("@");
    const user = at > 0 ? label.slice(0, at) : label;
    const host = at > 0 ? label.slice(at + 1) : "";
    const known = KNOWN_CALDAV_HOSTS.find((h) => h.match.test(host));
    return { title: known?.title ?? (host || "CalDAV"), subtitle: `${user} · CalDAV`, mark: known?.mark ?? "Dv" };
  }
  if (conn.provider === "ics_feed") {
    return { title: conn.calendars[0]?.name ?? label, subtitle: label, mark: "" };
  }
  return { title: conn.providerName, subtitle: label, mark: PROVIDER_MARKS[conn.provider] ?? conn.providerName.slice(0, 2) };
}

export function calendarsSummary(connections: readonly ConnectionView[]): CalendarsSummary {
  let destination: string | null = null;
  let checked = 0;
  for (const conn of connections) {
    for (const cal of conn.calendars) {
      if (cal.checkConflicts && !conn.invalid) checked += 1;
      if (cal.isDestination) destination = `${cal.name} · ${accountDisplay(conn).title}`;
    }
  }
  return { checked, destination, connections: connections.length, needsAttention: connections.filter((c) => c.invalid).length };
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
