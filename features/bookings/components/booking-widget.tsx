"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingLayout } from "@/features/embed/target";
import { addDays, formatDate, type LocalDate, localDateOf, parseDate } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { emitEmbed, watchDimensions } from "@/lib/embed/bridge";
import { withLayoutParam } from "@/lib/embed/booking-link";
import { formatWeekdayDate, prefers12Hour } from "@/lib/format";
import { holdSlotAction } from "../server/public-actions";
import { BookerPreferences } from "./booker-preferences";
import {
  anchorDay,
  effectiveLayout,
  findSlotByStart,
  inRange,
  maxDate,
  type Month,
  monthOf,
  monthRange,
  normalizeWeekStart,
  rangeKey,
  rangeWindow,
  type Slot,
  shiftMonth,
  startOfWeek,
  weekFor,
  weekRange,
} from "./booker-view";
import { BookingDetails } from "./booking-details";
import { BookingForm, type BookingFormConfig } from "./booking-form";
import { LayoutSwitcher, useNarrowScreen } from "./layout-switcher";
import { MonthCalendar } from "./month-calendar";
import { WeekCalendar } from "./week-calendar";

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
  /** `month=yyyy-MM`: opens that month without picking a day. */
  initialMonth?: string;
  /** `slot=` link: epoch ms of a start to open the booking form for, when still free. */
  initialSlot?: number;
  /** `layout=` link parameter; the booker can switch. */
  initialLayout?: BookingLayout;
  /** The host's first day of the week (0 = Sunday) for the week layout; Monday when unknown. */
  weekStart?: number;
  /** Embed mode hides event details when asked (EMB-004). */
  hideDetails?: boolean;
  form: BookingFormConfig;
};

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

function parseInitialDate(value: string | undefined): LocalDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

export function BookingWidget(props: BookingWidgetProps) {
  const { form } = props;
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [locale, setLocale] = useState("en-US");
  const [timeZone, setTimeZone] = useState("UTC");
  const [tzInput, setTzInput] = useState("UTC");
  const [hour12, setHour12] = useState(false);
  const [duration, setDuration] = useState(props.initialDuration && props.durations.includes(props.initialDuration) ? props.initialDuration : props.durations[0]);
  const [layout, setLayout] = useState<BookingLayout>(props.initialLayout ?? "month");
  const [month, setMonth] = useState<Month | null>(null);
  /** First day of the visible week (week layout). */
  const [week, setWeek] = useState<LocalDate | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Which range/zone/duration the current `slots` belong to; drives aria-busy. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  /** A `slot=` start that is no longer free: shown as a notice on its day. */
  const [slotNotice, setSlotNotice] = useState<number | null>(null);
  const pendingSlot = useRef<number | null>(null);
  const holdToken = useRef("");
  const requestSeq = useRef(0);
  const idempotencyKey = useRef("");
  const narrow = useNarrowScreen();
  const shown = effectiveLayout(layout, narrow);
  const hostWeekStart = normalizeWeekStart(props.weekStart);

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
    // A `slot=` link opens the slot's day in the booker's zone; it wins over `date=`.
    const initial = props.initialSlot !== undefined ? localDateOf(props.initialSlot, tz) : parseInitialDate(props.initialDate);
    const opening = initial ?? parseInitialDate(props.initialMonth && `${props.initialMonth}-01`);
    const target = opening && opening.year * 12 + opening.month >= today.year * 12 + today.month ? opening : today;
    setMonth(monthOf(target));
    setWeek(weekFor(target, today, hostWeekStart));
    if (initial && target === opening) setSelectedDate(formatDate(initial));
    if (props.initialSlot !== undefined) {
      if (props.initialSlot > now) pendingSlot.current = props.initialSlot;
      else setSlotNotice(props.initialSlot);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    emitEmbed("ready", {});
    return watchDimensions();
  }, [props.lockTimeZone, props.initialDate, props.initialMonth, props.initialSlot, hostWeekStart]);

  const prefs = useMemo(() => ({ locale, timeZone, hour12 }), [locale, timeZone, hour12]);
  const timeZones = useMemo(() => (ready ? Intl.supportedValuesOf("timeZone") : []), [ready]);

  const range = useMemo(() => (shown === "week" ? week && weekRange(week) : month && monthRange(month)), [shown, week, month]);
  const requestKey = range ? `${rangeKey(range)}|${timeZone}|${duration}` : null;

  const load = useCallback(async () => {
    if (!range) return;
    const key = `${rangeKey(range)}|${timeZone}|${duration}`;
    const seq = ++requestSeq.current;
    const span = rangeWindow(range, timeZone, Date.now());
    if (!span) {
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
      start: span.start,
      end: span.end,
      hold: holdToken.current,
      ...(form.link && { link: form.link }),
      ...(form.reschedule && { reschedule: form.reschedule.uid, token: form.reschedule.token }),
    };
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
      if (seq !== requestSeq.current) return; // a newer range/zone/duration was requested meanwhile
      setSlots(data.slots);
      setLoadedKey(key);
    } catch {
      if (seq === requestSeq.current) setLoadError("Couldn't load available times. Please try again.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [range, timeZone, duration, form.username, form.team, form.slug, form.link, form.reschedule]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching is the effect's purpose
    void load();
  }, [load]);

  const chooseSlot = useCallback(
    async (slot: Slot) => {
      setSelectedSlot(slot);
      setSelectedDate(formatDate(localDateOf(slot.start, timeZone)));
      setSlotNotice(null);
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
    },
    [timeZone, duration, form.username, form.team, form.slug, form.link, load],
  );

  // `slot=` preselection: once the slot's range has loaded, open the form or explain it's gone.
  useEffect(() => {
    const pending = pendingSlot.current;
    if (pending === null || !range || loadedKey !== requestKey) return;
    pendingSlot.current = null;
    if (!inRange(localDateOf(pending, timeZone), range)) return; // the booker already moved on
    const match = findSlotByStart(slots, pending);
    if (match) void chooseSlot(match);
    else setSlotNotice(pending);
  }, [loadedKey, requestKey, range, slots, timeZone, chooseSlot]);

  const byDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = formatDate(localDateOf(s.start, timeZone));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots, timeZone]);

  const stacked = ready && shown === "column";
  const details = (
    <BookingDetails
      title={props.title}
      hostName={props.hostName}
      description={props.description}
      durations={props.durations}
      duration={duration}
      seated={props.seated}
      hideDetails={props.hideDetails}
      stacked={stacked}
      form={form}
      prefs={prefs}
      ready={ready}
      onDuration={(d) => {
        setDuration(d);
        setSelectedSlot(null);
      }}
    />
  );

  // Before hydration (and on the server) the event details already render — they are the page's
  // main content (NFR-003 LCP); only the calendar needs the browser's time zone and locale.
  if (!ready || !month || !week || !range) {
    return (
      <div className="@container/booker">
        <div className="grid gap-0 @3xl/booker:grid-cols-[260px_1fr]">
          {details}
          <div className="p-4 @lg/booker:p-6" aria-busy="true">
            <span className="sr-only">Loading availability…</span>
            <div className="flex max-w-md flex-col gap-3" aria-hidden>
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }, (_, i) => (
                  <Skeleton key={i} className="aspect-square max-h-12" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const today = localDateOf(nowMs, timeZone);
  const busy = loading || loadedKey !== requestKey;

  const changeLayout = (next: BookingLayout) => {
    if (next === layout) return;
    const now = localDateOf(Date.now(), timeZone);
    const selected = selectedDate ? parseDate(selectedDate) : null;
    if (next === "week") setWeek(weekFor(anchorDay({ selected, month, today: now }), now, hostWeekStart));
    else if (layout === "week") setMonth(monthOf(selected ?? maxDate(week, now)));
    setLayout(next);
    setSlotNotice(null);
    try {
      window.history.replaceState(null, "", withLayoutParam(window.location.href, next));
    } catch {
      // The URL is a convenience (shareable layout); the switch itself already happened.
    }
  };

  const preferences = (
    <BookerPreferences
      lockTimeZone={props.lockTimeZone}
      tzInput={tzInput}
      timeZones={timeZones}
      hour12={hour12}
      onTzInput={setTzInput}
      onTimeZone={(tz) => {
        setTimeZone(tz);
        setSelectedDate(null);
      }}
      onHour12={setHour12}
    />
  );

  return (
    // Layout follows the booker's own width (container queries), not the window's: in a popup or a
    // narrow host column the window can be wide while the booker is not.
    <div className="@container/booker">
      <div className={cn("grid gap-0", !stacked && "@3xl/booker:grid-cols-[260px_1fr]")}>
        {details}
        <div className="@container/panel min-w-0 p-4 @lg/booker:p-6">
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
            <>
              {!narrow && (
                <div className="mb-4 flex justify-end">
                  <LayoutSwitcher value={layout} onChange={changeLayout} />
                </div>
              )}
              {slotNotice !== null && (
                <Alert className="mb-4">
                  <AlertDescription>That time is no longer available — pick another time on {formatWeekdayDate(slotNotice, prefs)}.</AlertDescription>
                </Alert>
              )}
              {shown === "week" ? (
                <WeekCalendar
                  week={week}
                  firstWeek={startOfWeek(today, hostWeekStart)}
                  prefs={prefs}
                  byDate={byDate}
                  selectedDate={selectedDate}
                  busy={busy}
                  loading={loading}
                  loadError={loadError}
                  seated={props.seated}
                  preferences={preferences}
                  onChangeWeek={(delta) => {
                    setWeek(addDays(week, 7 * delta));
                    setSlotNotice(null);
                  }}
                  onChooseSlot={(slot) => {
                    emitEmbed("dateSelected", { date: formatDate(localDateOf(slot.start, timeZone)) });
                    void chooseSlot(slot);
                  }}
                />
              ) : (
                <MonthCalendar
                  month={month}
                  today={today}
                  weekStart={browserWeekStart(locale)}
                  prefs={prefs}
                  byDate={byDate}
                  selectedDate={selectedDate}
                  busy={busy}
                  loading={loading}
                  loadError={loadError}
                  empty={slots.length === 0}
                  seated={props.seated}
                  stacked={shown === "column"}
                  nowMs={nowMs}
                  preferences={preferences}
                  onChangeMonth={(delta) => {
                    setMonth(shiftMonth(month, delta));
                    setSelectedDate(null);
                    setSlotNotice(null);
                  }}
                  onSelectDate={(key) => {
                    setSelectedDate(key);
                    setSlotNotice(null);
                    emitEmbed("dateSelected", { date: key });
                  }}
                  onChooseSlot={(slot) => void chooseSlot(slot)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
