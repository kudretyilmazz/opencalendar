"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, type LocalDate, wallToUtc } from "@/lib/availability/tz";
import type { EmbedTarget } from "../target";

export type WeekSlotsState =
  | { status: "idle" | "loading"; slots: readonly string[] }
  | { status: "ready"; slots: readonly string[] }
  | { status: "error"; slots: readonly string[]; message: string };

type Booking = NonNullable<EmbedTarget["booking"]>;

type Query = { booking: Booking; duration: number; timeZone: string | null; weekStart: LocalDate | null };

const EMPTY: readonly string[] = [];

/**
 * Free slot starts (ISO) of one week, from POST /api/public/slots — the same endpoint and window
 * rules as the booking widget. A newer query wins over a response still in flight.
 */
export function useWeekSlots({ booking, duration, timeZone, weekStart }: Query): WeekSlotsState & { retry: () => void } {
  const [state, setState] = useState<WeekSlotsState>({ status: "idle", slots: EMPTY });
  const seq = useRef(0);
  const { username, team, slug } = booking;

  const load = useCallback(async () => {
    if (!timeZone || !weekStart) return;
    const id = ++seq.current;
    const start = Math.max(Date.now(), wallToUtc(weekStart, 0, timeZone));
    const end = wallToUtc(addDays(weekStart, 7), 0, timeZone);
    if (end <= start) {
      setState({ status: "ready", slots: EMPTY });
      return;
    }
    setState((prev) => ({ status: "loading", slots: prev.slots }));
    try {
      const res = await fetch("/api/public/slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username ?? "", ...(team && { team }), slug, duration, start, end }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { slots?: { start: number }[] };
      if (id !== seq.current) return;
      const slots = (data.slots ?? []).filter((s) => Number.isFinite(s.start)).map((s) => new Date(s.start).toISOString());
      setState({ status: "ready", slots });
    } catch {
      if (id === seq.current) setState({ status: "error", slots: EMPTY, message: "Couldn't load available times. Please try again." });
    }
  }, [username, team, slug, duration, timeZone, weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching is the effect's purpose
    void load();
  }, [load]);

  return { ...state, retry: load };
}
