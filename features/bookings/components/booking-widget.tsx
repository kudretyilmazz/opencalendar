"use client";

import { ChevronLeft, ChevronRight, Clock, Globe, MapPin, Repeat, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input } from "@/components/ui/primitives";
import { addDays, formatDate, isValidTimeZone, type LocalDate, localDateOf, parseDate, wallToUtc, weekdayOf } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { emitEmbed, watchDimensions } from "@/lib/embed/bridge";
import { formatDateLong, formatDuration, formatTime, prefers12Hour } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { holdSlotAction } from "../server/public-actions";
import { BookingForm, type BookingFormConfig } from "./booking-form";

export type BookingWidgetProps = {
  title: string;
  hostName: string;
  description: string | null;
  durations: number[];
  /** Seated events show the seats left per time (EVT-012). */
  seated: boolean;
  /** EVT-017: times are always shown in this zone. */
  lockTimeZone: string | null;
  /** Initial duration and date from URL prefill (BKG-014). */
  initialDuration?: number;
  initialDate?: string;
  /** Embed mode hides event details when asked (EMB-004). */
  hideDetails?: boolean;
  form: BookingFormConfig;
};

type Slot = { start: number; end: number; seats?: number };
type Month = { year: number; month: number };

type WeekInfoLocale = Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };

/** First day of the week for the booker's locale (Intl `firstDay`: 1 = Monday … 7 = Sunday). */
function browserWeekStart(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as WeekInfoLocale;
    const info = loc.getWeekInfo?.() ?? loc.weekInfo; // Firefox only has the property
    return info ? info.firstDay % 7 : 1;
  } catch {
    return 1;
  }
}

function monthDays(m: Month): LocalDate[] {
  const first = { year: m.year, month: m.month, day: 1 };
  const days: LocalDate[] = [];
  for (let d = first; d.month === m.month; d = addDays(d, 1)) days.push(d);
  return days;
}

function parseInitialDate(value: string | undefined): LocalDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

const shiftMonth = (m: Month, delta: number): Month => {
  const d = new Date(Date.UTC(m.year, m.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

export function BookingWidget(props: BookingWidgetProps) {
  const { form } = props;
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [locale, setLocale] = useState("en-US");
  const [timeZone, setTimeZone] = useState("UTC");
  const [tzInput, setTzInput] = useState("UTC");
  const [hour12, setHour12] = useState(false);
  const [duration, setDuration] = useState(props.initialDuration && props.durations.includes(props.initialDuration) ? props.initialDuration : props.durations[0]);
  const [month, setMonth] = useState<Month | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Which month/zone/duration the current `slots` belong to; drives aria-busy. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const holdToken = useRef("");
  const requestSeq = useRef(0);
  const idempotencyKey = useRef("");

  // Browser-only defaults (BKG-003): detected zone, locale clock convention.
  useEffect(() => {
    const lang = navigator.language || "en-US";
    const tz = props.lockTimeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    holdToken.current = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    idempotencyKey.current = crypto.randomUUID();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from browser APIs */
    setLocale(lang);
    setTimeZone(tz);
    setTzInput(tz);
    setHour12(prefers12Hour(lang));
    const now = Date.now();
    setNowMs(now);
    const today = localDateOf(now, tz);
    const initial = parseInitialDate(props.initialDate);
    const target = initial && initial.year * 12 + initial.month >= today.year * 12 + today.month ? initial : today;
    setMonth({ year: target.year, month: target.month });
    if (initial && target === initial) setSelectedDate(formatDate(initial));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    emitEmbed("ready", {});
    return watchDimensions();
  }, [props.lockTimeZone, props.initialDate]);

  const prefs = useMemo(() => ({ locale, timeZone, hour12 }), [locale, timeZone, hour12]);
  const timeZones = useMemo(() => (ready ? Intl.supportedValuesOf("timeZone") : []), [ready]);

  const requestKey = month ? `${month.year}-${month.month}|${timeZone}|${duration}` : null;

  const load = useCallback(async () => {
    if (!month) return;
    const key = `${month.year}-${month.month}|${timeZone}|${duration}`;
    const start = Math.max(Date.now(), wallToUtc({ ...month, day: 1 }, 0, timeZone));
    const end = wallToUtc({ ...shiftMonth(month, 1), day: 1 }, 0, timeZone);
    if (end <= start) {
      setSlots([]);
      setLoadedKey(key);
      return;
    }
    // POST keeps a reschedule's manage token out of URLs and access logs.
    const body = {
      username: form.username,
      ...(form.team && { team: form.team }),
      slug: form.slug,
      duration,
      start,
      end,
      hold: holdToken.current,
      ...(form.link && { link: form.link }),
      ...(form.reschedule && { reschedule: form.reschedule.uid, token: form.reschedule.token }),
    };
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/public/slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { slots: Slot[] };
      if (seq !== requestSeq.current) return; // a newer month/zone/duration was requested meanwhile
      setSlots(data.slots);
      setLoadedKey(key);
    } catch {
      if (seq === requestSeq.current) setLoadError("Couldn't load available times. Please try again.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [month, timeZone, duration, form.username, form.team, form.slug, form.link, form.reschedule]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching is the effect's purpose
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = formatDate(localDateOf(s.start, timeZone));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots, timeZone]);

  // Before hydration (and on the server) the event details already render — they are the page's
  // main content (NFR-003 LCP); only the calendar needs the browser's time zone and locale.
  if (!ready || !month) {
    return (
      <div className="grid gap-0 md:grid-cols-[260px_1fr]">
        <aside className={cn("flex flex-col gap-3 border-b border-border p-6 md:border-b-0 md:border-r", props.hideDetails && "sr-only")}>
          <p className="text-sm text-muted">{props.hostName}</p>
          <h1 className="text-xl font-semibold">{props.title}</h1>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Clock className="size-4" aria-hidden /> {formatDuration(duration, locale)}
          </p>
          {props.description && <Markdown source={props.description} className="text-sm" />}
        </aside>
        <div className="p-6 text-sm text-muted" aria-busy="true">
          Loading availability…
        </div>
      </div>
    );
  }

  const weekStart = browserWeekStart(locale);
  const days = monthDays(month);
  const leading = (weekdayOf(days[0]) - weekStart + 7) % 7;
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2026, 0, 4 + ((weekStart + i) % 7))),
  );
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(month.year, month.month - 1, 1),
  );
  const today = localDateOf(nowMs, timeZone);
  const canGoBack = month.year > today.year || (month.year === today.year && month.month > today.month);

  const changeMonth = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setSelectedDate(null);
  };

  const chooseSlot = async (slot: Slot) => {
    setSelectedSlot(slot);
    emitEmbed("slotSelected", { start: slot.start, end: slot.end });
    try {
      const held = await holdSlotAction({ username: form.username, ...(form.team && { team: form.team }), slug: form.slug, start: slot.start, duration, holdToken: holdToken.current, link: form.link });
      if (!held.ok) {
        setSelectedSlot(null);
        setLoadError(held.message);
        void load();
      }
    } catch {
      // Holding is best-effort; booking re-validates the slot anyway.
    }
  };

  return (
    <div className="grid gap-0 md:grid-cols-[260px_1fr]">
      <aside className={cn("flex flex-col gap-3 border-b border-border p-6 md:border-b-0 md:border-r", props.hideDetails && "sr-only")}>
        <p className="text-sm text-muted">{props.hostName}</p>
        <h1 className="text-xl font-semibold">{props.title}</h1>
        {form.reschedule && (
          <Alert>
            Rescheduling your booking from {formatDateLong(form.reschedule.previousStart, prefs)},{" "}
            {formatTime(form.reschedule.previousStart, prefs)}.
          </Alert>
        )}
        <p className="flex items-center gap-2 text-sm text-muted">
          <Clock className="size-4" aria-hidden /> {formatDuration(duration, locale)}
        </p>
        {form.recurring && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Repeat className="size-4" aria-hidden /> Can repeat {form.recurring.frequency === "weekly" ? "weekly" : "monthly"}, up to {form.recurring.maxCount} times
          </p>
        )}
        {props.seated && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Users className="size-4" aria-hidden /> Group event
          </p>
        )}
        {form.locations.map((loc) => (
          <p key={loc.kind} className="flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-4" aria-hidden /> {loc.label}
          </p>
        ))}
        {props.description && <Markdown source={props.description} className="text-sm" />}
        {props.durations.length > 1 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Duration</legend>
            <div className="flex flex-wrap gap-2">
              {props.durations.map((d) => (
                <Button
                  key={d}
                  type="button"
                  variant={d === duration ? "primary" : "secondary"}
                  aria-pressed={d === duration}
                  className="h-8 px-3"
                  onClick={() => {
                    setDuration(d);
                    setSelectedSlot(null);
                  }}
                >
                  {formatDuration(d, locale)}
                </Button>
              ))}
            </div>
          </fieldset>
        )}
      </aside>

      <div className="p-6">
        {selectedSlot ? (
          <BookingForm
            config={form}
            slot={selectedSlot}
            duration={duration}
            prefs={prefs}
            tokens={() => ({ hold: holdToken.current, idempotencyKey: idempotencyKey.current })}
            onBack={() => setSelectedSlot(null)}
            onTaken={() => {
              setSelectedSlot(null);
              void load();
            }}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
            <section aria-label="Choose a date" aria-busy={loading || loadedKey !== requestKey}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium" aria-live="polite">
                  {monthLabel}
                </h2>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-9 px-0"
                    aria-label="Previous month"
                    disabled={!canGoBack}
                    onClick={() => changeMonth(-1)}
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" className="h-9 w-9 px-0" aria-label="Next month" onClick={() => changeMonth(1)}>
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden>
                {weekdayNames.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label="Days">
                {Array.from({ length: leading }, (_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map((d) => {
                  const key = formatDate(d);
                  const available = (byDate.get(key)?.length ?? 0) > 0;
                  const selected = key === selectedDate;
                  const label = formatDateLong(wallToUtc(d, 12 * 60, "UTC"), { ...prefs, timeZone: "UTC" });
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!available}
                      aria-pressed={selected}
                      aria-label={`${label}${available ? "" : ", no times available"}`}
                      onClick={() => {
                        setSelectedDate(key);
                        emitEmbed("dateSelected", { date: key });
                      }}
                      className={cn(
                        "aspect-square rounded-md text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        available ? "bg-accent font-medium hover:bg-primary hover:text-primary-foreground" : "text-muted opacity-50",
                        selected && "bg-primary text-primary-foreground",
                      )}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
              {loading && <p className="mt-3 text-sm text-muted" aria-live="polite">Loading…</p>}
              {loadError && <Alert tone="error" className="mt-3">{loadError}</Alert>}
              {!loading && !loadError && slots.length === 0 && (
                <p className="mt-3 text-sm text-muted">No times available this month. Try the next month.</p>
              )}
              <div className="mt-6 flex flex-wrap items-end gap-3">
                {props.lockTimeZone ? (
                  <p className="flex items-center gap-1 text-sm">
                    <Globe className="size-4" aria-hidden /> Times in {props.lockTimeZone.replaceAll("_", " ")}
                  </p>
                ) : (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="tz" className="flex items-center gap-1 text-sm font-medium">
                    <Globe className="size-4" aria-hidden /> Time zone
                  </label>
                  <Input
                    id="tz"
                    list="tz-options"
                    value={tzInput}
                    className="w-64"
                    onChange={(e) => {
                      setTzInput(e.target.value);
                      if (isValidTimeZone(e.target.value) && timeZones.includes(e.target.value)) {
                        setTimeZone(e.target.value);
                        setSelectedDate(null);
                      }
                    }}
                  />
                  <datalist id="tz-options">
                    {timeZones.map((tz) => (
                      <option key={tz} value={tz} />
                    ))}
                  </datalist>
                </div>
                )}
                <div role="group" aria-label="Clock format" className="flex">
                  <Button type="button" variant={hour12 ? "primary" : "secondary"} aria-pressed={hour12} className="h-10 rounded-r-none" onClick={() => setHour12(true)}>
                    12h
                  </Button>
                  <Button type="button" variant={!hour12 ? "primary" : "secondary"} aria-pressed={!hour12} className="h-10 rounded-l-none" onClick={() => setHour12(false)}>
                    24h
                  </Button>
                </div>
              </div>
            </section>
            <section aria-label="Choose a time">
              {selectedDate ? (
                <>
                  <h2 className="mb-3 text-sm font-medium">
                    {formatDateLong(byDate.get(selectedDate)?.[0]?.start ?? nowMs, prefs)}
                  </h2>
                  <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                    {(byDate.get(selectedDate) ?? []).map((s) => (
                      <li key={s.start}>
                        <Button type="button" variant="secondary" className="w-full" onClick={() => void chooseSlot(s)}>
                          {formatTime(s.start, prefs)}
                          {props.seated && s.seats !== undefined && <span className="ml-2 text-xs text-muted">{s.seats} {s.seats === 1 ? "seat" : "seats"} left</span>}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted">Select a date to see available times.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
