/**
 * What an embed points at, shared by the embed builder, the email embed and the snippet
 * generators. `calLink` is the path after the instance URL, in the shapes the loader accepts
 * (public/embed.js `buildUrl`): "erin", "erin/intro", "erin+olga/intro", "team/robin",
 * "team/robin/discovery", "forms/<id>".
 */
export type EmbedTarget = {
  kind: "profile" | "eventType" | "team" | "teamEventType" | "form";
  calLink: string;
  /** Shown in the builder's title, e.g. "Intro call". */
  label: string;
  /**
   * Only for a single bookable event type (kind "eventType" | "teamEventType"): enables the
   * email embed, which needs one event type's slots. Mirrors POST /api/public/slots.
   */
  booking?: {
    /** Personal event types: the host's username. */
    username?: string;
    /** Team event types: the team slug. */
    team?: string;
    slug: string;
    durations: number[];
  };
};

/**
 * Query parameters a booking page understands (besides prefill answers):
 * - `date=yyyy-MM-dd` opens that day (existing);
 * - `duration=<minutes>` picks one of the event type's durations (existing);
 * - `month=yyyy-MM` opens that month when no `date`/`slot` is given;
 * - `slot=<ISO 8601 UTC start>` opens the booking form for that start if it is still free,
 *   otherwise shows that day with a notice (added for the email embed);
 * - `layout=month|week|column` picks the calendar layout; the booker can switch (added);
 * - `embed=1&theme=…&brand=…&hideDetails=1` for the compact embed variant (existing, EMB-004).
 */
export const BOOKING_LINK_PARAMS = ["date", "month", "duration", "slot", "layout"] as const;

export type BookingLayout = "month" | "week" | "column";
export const BOOKING_LAYOUTS: readonly BookingLayout[] = ["month", "week", "column"];
