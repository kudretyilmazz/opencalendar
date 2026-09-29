/** Pure display helpers for the Settings page (no server or browser APIs). */

/** Up to two initials for the avatar: "Erin Example" → "EE", "cher" → "C". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/** "GMT+3 · 21:30 now" — the zone's UTC offset and its current wall time. */
export function zoneClock(timeZone: string, now: Date, hour12: boolean): string {
  try {
    const offset =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ??
      "";
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: hour12 ? "numeric" : "2-digit",
      minute: "2-digit",
      hourCycle: hour12 ? "h12" : "h23",
    }).format(now);
    return `${offset} · ${time} now`;
  } catch {
    return ""; // an unknown zone shows nothing rather than breaking the form
  }
}
