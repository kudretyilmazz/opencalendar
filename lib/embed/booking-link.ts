import { BOOKING_LAYOUTS, type BookingLayout } from "@/features/embed/target";

/**
 * Parsing of the booking-link query parameters (`features/embed/target.ts` BOOKING_LINK_PARAMS).
 * Every value is untrusted: anything outside the allow-listed shapes is dropped, never an error.
 */

type Query = Record<string, string | string[] | undefined>;

export type BookingLinkParams = {
  /** `yyyy-MM-dd`, a real calendar date. */
  date?: string;
  /** `yyyy-MM`: opens that month without picking a day (ignored when `date` or `slot` is set). */
  month?: string;
  /** Positive whole minutes; the widget still checks it against the event's durations. */
  duration?: number;
  /** Epoch milliseconds of the requested start. */
  slot?: number;
  layout?: BookingLayout;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseLayout(value: unknown): BookingLayout | undefined {
  return typeof value === "string" && (BOOKING_LAYOUTS as readonly string[]).includes(value)
    ? (value as BookingLayout)
    : undefined;
}

export function parseDateParam(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3])
    ? value
    : undefined;
}

export function parseMonthParam(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

export function parseDurationParam(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|\+00:?00)$/;

/** An ISO 8601 UTC instant (`2026-10-01T09:30:00Z`, `…:00.000Z` or `+00:00`) → epoch ms. */
export function parseSlotParam(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > 32) return undefined;
  const m = ISO_UTC.exec(value);
  if (!m) return undefined;
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number);
  const second = Number(m[6] ?? 0);
  const ms = Number((m[7] ?? "0").padEnd(3, "0"));
  if (year < 2000 || year > 2999 || hour > 23 || minute > 59 || second > 59) return undefined;
  const t = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const d = new Date(t);
  // Rejects rolled-over dates such as 2026-02-30.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return undefined;
  return t;
}

export function parseBookingLinkParams(query: Query): BookingLinkParams {
  const date = parseDateParam(one(query.date));
  const month = parseMonthParam(one(query.month));
  const duration = parseDurationParam(one(query.duration));
  const slot = parseSlotParam(one(query.slot));
  const layout = parseLayout(one(query.layout));
  return {
    ...(date && { date }),
    ...(month && { month }),
    ...(duration && { duration }),
    ...(slot !== undefined && { slot }),
    ...(layout && { layout }),
  };
}

/** The same URL with `layout` set, other parameters (and the hash) kept. */
export function withLayoutParam(href: string, layout: BookingLayout): string {
  const url = new URL(href);
  url.searchParams.set("layout", layout);
  return url.toString();
}
