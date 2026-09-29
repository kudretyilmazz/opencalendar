/**
 * Pure helpers behind the event types list: wording for each row, the status filter and the
 * search. Nothing here reads the clock or the database, so the client can filter freely.
 */
import { LOCATION_LABELS, type LocationKind } from "./schemas";

export type EventTypeStatus = "active" | "hidden" | "off";
export type EventTypeFilter = "all" | EventTypeStatus;
export const EVENT_TYPE_FILTERS: readonly { value: EventTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden" },
  { value: "off", label: "Off" },
];

export type BadgeTone = "warning" | "outline" | "muted";
export type RowBadge = { label: string; tone: BadgeTone };

/** "Off" wins over "Hidden": a switched-off event type can't be booked at all. */
export const statusOf = (et: { enabled: boolean; hidden: boolean }): EventTypeStatus =>
  !et.enabled ? "off" : et.hidden ? "hidden" : "active";

/** "30 min" or "30 · 45 · 60 min". */
export function durationLabel(minutes: readonly number[]): string {
  return `${minutes.join(" · ")} min`;
}

const SHORT_LOCATION: Partial<Record<LocationKind | "phone", string>> = {
  phone: "Phone call",
  phone_host: "Phone call",
  phone_attendee: "Phone call",
  link: "Meeting link",
};

/** The first location in words ("In person" shows the address), "+2" when there are more. */
export function locationLabel(locations: readonly { kind: LocationKind | "phone"; value: string | null }[]): string {
  const [first, ...rest] = locations;
  if (!first) return "No location";
  const base =
    first.kind === "in_person" && first.value
      ? first.value
      : (SHORT_LOCATION[first.kind] ?? LOCATION_LABELS[first.kind as LocationKind]);
  return rest.length ? `${base} +${rest.length}` : base;
}

const RECURRING: Record<string, string> = { weekly: "Weekly", monthly: "Monthly" };

/** Status and setting chips shown next to the title, most important first. */
export function rowBadges(et: {
  enabled: boolean;
  hidden: boolean;
  requiresConfirmation: boolean;
  recurringFrequency: string | null;
  seatsPerSlot: number | null;
  linkOnly: boolean;
}): RowBadge[] {
  const badges: RowBadge[] = [];
  if (!et.enabled) badges.push({ label: "Off", tone: "outline" });
  else if (et.hidden) badges.push({ label: "Hidden", tone: "outline" });
  if (et.requiresConfirmation) badges.push({ label: "Requires confirmation", tone: "warning" });
  if (et.linkOnly) badges.push({ label: "Private links only", tone: "muted" });
  if (et.recurringFrequency) badges.push({ label: RECURRING[et.recurringFrequency] ?? "Recurring", tone: "muted" });
  if (et.seatsPerSlot) badges.push({ label: `${et.seatsPerSlot} seats`, tone: "muted" });
  return badges;
}

/** The right-hand figure: this week's bookings, or why there are none. */
export function weekSummary(status: EventTypeStatus, count: number): { value: string; label: string } {
  if (status === "off") return { value: "—", label: "not bookable" };
  return { value: String(count), label: status === "hidden" ? "by link" : "this week" };
}

export function filterCounts(rows: readonly { status: EventTypeStatus }[]): Record<EventTypeFilter, number> {
  const counts: Record<EventTypeFilter, number> = { all: rows.length, active: 0, hidden: 0, off: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** Rows matching the status filter and a case-insensitive search on title and slug. */
export function filterRows<T extends { status: EventTypeStatus; title: string; slug: string }>(
  rows: readonly T[],
  filter: EventTypeFilter,
  query: string,
): T[] {
  const q = query.trim().toLocaleLowerCase();
  return rows.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!q || r.title.toLocaleLowerCase().includes(q) || r.slug.toLocaleLowerCase().includes(q)),
  );
}

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((p) => p[0]!.toLocaleUpperCase()).join("") || "?";
}

/** One row of the list, as the server hands it to the client (strings already formatted). */
export type EventTypeListRow = {
  id: string;
  title: string;
  slug: string;
  status: EventTypeStatus;
  durations: string;
  location: string;
  badges: RowBadge[];
  week: { value: string; label: string };
  /** The public booking link, when the host has a username. */
  url: string | null;
};
