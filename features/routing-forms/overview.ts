import type { RoutingAction, RoutingAnswers, RoutingField, RoutingRule } from "@/db/schema/routing";
import { addDays, formatDate, localDateOf } from "@/lib/availability/tz";
import { type FormatPrefs, formatTime } from "@/lib/format";
import { OPERATOR_LABELS } from "./schemas";

/**
 * Pure helpers for the routing forms overview (RTE-001…005): what a form routes to, its response
 * trend and a plain-language summary of its rules. Event type titles are looked up by the caller.
 */

export type Titles = Readonly<Record<string, string>>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const TREND_DAYS = 30;
export const TREND_BUCKET_DAYS = 3;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Short label of where an action sends the visitor. */
export function actionLabel(action: RoutingAction, titles: Titles): string {
  if (action.kind === "event_type") return titles[action.eventTypeId] ?? "Deleted event type";
  return action.kind === "external_url" ? hostOf(action.url) : "Message";
}

/** Distinct targets of the rules, in order, then the fallback's. */
export function routeLabels(form: { rules: readonly RoutingRule[]; fallback: RoutingAction }, titles: Titles): string[] {
  return [...new Set([...form.rules.map((r) => actionLabel(r.action, titles)), actionLabel(form.fallback, titles)])];
}

/** Every event type id a set of forms routes to. */
export function referencedEventTypeIds(forms: readonly { rules: readonly RoutingRule[]; fallback: RoutingAction }[]): string[] {
  const ids = forms.flatMap((f) => [...f.rules.map((r) => r.action), f.fallback]).flatMap((a) => (a.kind === "event_type" ? [a.eventTypeId] : []));
  return [...new Set(ids)];
}

/** Start of the trend window and the length of one bucket, for the SQL that counts responses. */
export function trendWindow(now: number, days = TREND_DAYS, bucketDays = TREND_BUCKET_DAYS): { since: Date; bucketSeconds: number } {
  return { since: new Date(now - days * DAY_MS), bucketSeconds: bucketDays * 24 * 60 * 60 };
}

/**
 * Per-bucket counts (bucket 0 = oldest) as a dense array over the last `days`. Out-of-range
 * indexes are clamped, so a response at exactly `now` lands in the newest bucket.
 */
export function trendBuckets(counts: readonly { bucket: number; count: number }[], days = TREND_DAYS, bucketDays = TREND_BUCKET_DAYS): number[] {
  const length = Math.ceil(days / bucketDays);
  const buckets = Array.from({ length }, () => 0);
  for (const { bucket, count } of counts) buckets[Math.min(length - 1, Math.max(0, bucket))] += count;
  return buckets;
}

const answerText = (value: RoutingAnswers[string]): string => (Array.isArray(value) ? value.join(", ") : String(value));

/**
 * Who answered (the name/email/company-like text answers, at most two) and the rest of the
 * answers as "Label: value". Falls back to the first answers when nothing identifies the person.
 */
export function responseSummary(fields: readonly RoutingField[], answers: RoutingAnswers): { who: string; answers: string } {
  const answered = fields.filter((f) => answers[f.key] !== undefined && answerText(answers[f.key]) !== "");
  const identifying = answered.filter((f) => f.type === "email" || (f.type === "text" && /name|company|organi[sz]ation|email/i.test(`${f.key} ${f.label}`)));
  const who = (identifying.length > 0 ? identifying : answered.slice(0, 1)).slice(0, 2);
  const rest = answered.filter((f) => !who.includes(f));
  return {
    who: who.map((f) => answerText(answers[f.key])).join(" · ") || "Anonymous",
    answers: rest.map((f) => `${f.label || f.key}: ${answerText(answers[f.key])}`).join(" · "),
  };
}

export type RuleSummary = {
  /** e.g. [{ field: "Team size", operator: "is", value: "51+" }] joined by `joiner`. */
  conditions: { field: string; operator: string; value: string }[];
  joiner: "and" | "or";
  target: string;
  kind: RoutingAction["kind"];
};

function conditionValue(operator: string, value: readonly string[]): string {
  if (operator === "between") return value.join(" and ");
  if (operator === "in") return value.join(", ");
  return value[0] ?? "";
}

/** Plain-language rules: "If <field> <op> <value> [and|or …] → <target>". */
export function ruleSummaries(form: { fields: readonly RoutingField[]; rules: readonly RoutingRule[] }, titles: Titles): RuleSummary[] {
  const labelOf = new Map(form.fields.map((f) => [f.key, f.label || f.key]));
  return form.rules.map((rule) => ({
    conditions: rule.conditions.map((c) => ({
      field: labelOf.get(c.field) ?? c.field,
      operator: OPERATOR_LABELS[c.operator],
      value: conditionValue(c.operator, c.value),
    })),
    joiner: rule.match === "all" ? "and" : "or",
    target: rule.action.kind === "message" ? rule.action.message : actionLabel(rule.action, titles),
    kind: rule.action.kind,
  }));
}

/** Fallback target text for the rules summary. */
export const fallbackTarget = (fallback: RoutingAction, titles: Titles): string =>
  fallback.kind === "message" ? fallback.message : actionLabel(fallback, titles);

export type Outcome = { label: string; kind: "booked" | "event" | "message" };

/** Outcome pill of a response: booked (a booking came of it), sent to an event type/URL, or a message. */
export function responseOutcome(action: RoutingAction, titles: Titles, bookedEventTitle: string | null): Outcome {
  if (bookedEventTitle !== null) return { label: `Booked · ${bookedEventTitle}`, kind: "booked" };
  return { label: `→ ${actionLabel(action, titles)}`, kind: action.kind === "message" ? "message" : "event" };
}

/** "Today 14:12", "Yesterday 09:40" or "27 Sep" in the viewer's time zone. */
export function responseWhen(at: number, now: number, prefs: FormatPrefs): string {
  const day = formatDate(localDateOf(at, prefs.timeZone));
  const today = localDateOf(now, prefs.timeZone);
  if (day === formatDate(today)) return `Today ${formatTime(at, prefs)}`;
  if (day === formatDate(addDays(today, -1))) return `Yesterday ${formatTime(at, prefs)}`;
  return new Intl.DateTimeFormat(prefs.locale, { timeZone: prefs.timeZone, day: "numeric", month: "short" }).format(at);
}
