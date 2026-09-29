import { addDays, formatDate, localDateOf } from "@/lib/availability/tz";
import { type FormatPrefs, formatTime } from "@/lib/format";

/**
 * Pure helpers for the webhooks page (API-001, API-003): a subscription's health from its latest
 * deliveries, and the texts of the delivery log (response, attempts, relative times).
 */

export type DeliveryStatus = "pending" | "success" | "failed";

export type DeliveryFacts = {
  status: DeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: Date;
};

export type Health = "active" | "failing" | "paused";

/** A delivery that has been tried and did not succeed (finally failed, or waiting for a retry). */
const unsuccessful = (d: DeliveryFacts): boolean => d.status === "failed" || (d.status === "pending" && d.attempts > 0 && d.error !== null);
/** Deliveries whose outcome says something about the endpoint (not merely queued). */
const settled = (d: DeliveryFacts): boolean => d.status !== "pending" || d.attempts > 0;

/** Paused when inactive, failing when the latest tried delivery did not succeed, else active. */
export function webhookHealth(active: boolean, recent: readonly DeliveryFacts[]): Health {
  if (!active) return "paused";
  const latest = recent.find(settled);
  return latest && unsuccessful(latest) ? "failing" : "active";
}

const MINUTE = 60_000;

/** "just now", "4 min ago", "3 h ago", "2 d ago". */
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** The header line of a webhook card: the latest delivery, or the current failure streak. */
export function lastDeliveryText(recent: readonly DeliveryFacts[], now: number): string {
  const tried = recent.filter(settled);
  const latest = tried[0];
  if (!latest) return recent.length > 0 ? "Delivery queued" : "No deliveries yet";
  const code = latest.responseStatus === null ? "" : ` · ${latest.responseStatus}`;
  if (!unsuccessful(latest)) return `Last delivery ${timeAgo(latest.createdAt.getTime(), now)}${code}`;
  const streak = tried.findIndex((d) => !unsuccessful(d));
  const failed = streak === -1 ? tried.length : streak;
  return failed > 1 ? `Last ${failed} deliveries failed${code}` : `Last delivery failed ${timeAgo(latest.createdAt.getTime(), now)}${code}`;
}

export type ResponsePill = { label: string; tone: "success" | "danger" | "muted" };

/** "200 OK", "500 Error", "No response" or "Pending". */
export function responsePill(d: Pick<DeliveryFacts, "status" | "responseStatus" | "attempts">): ResponsePill {
  if (d.responseStatus !== null) {
    const ok = d.responseStatus >= 200 && d.responseStatus < 300;
    return { label: `${d.responseStatus} ${ok ? "OK" : "Error"}`, tone: ok ? "success" : "danger" };
  }
  if (d.status === "pending" && d.attempts === 0) return { label: "Pending", tone: "muted" };
  return d.status === "success" ? { label: "OK", tone: "success" } : { label: "No response", tone: "danger" };
}

/** "1", "3 of 11 · retrying", "11 of 11 · gave up", "1 · not retried". */
export function attemptText(d: Pick<DeliveryFacts, "status" | "attempts" | "error">, maxAttempts: number): string {
  if (d.status === "success") return String(d.attempts);
  if (d.status === "pending") return d.attempts === 0 ? "Queued" : `${d.attempts} of ${maxAttempts} · retrying`;
  return d.attempts >= maxAttempts ? `${d.attempts} of ${maxAttempts} · gave up` : `${d.attempts} · not retried`;
}

/** Share of settled deliveries that succeeded, as a whole percentage; null when nothing settled. */
export function deliveredPercent(counts: { success: number; failed: number }): number | null {
  const total = counts.success + counts.failed;
  if (total === 0) return null;
  return Math.floor((counts.success / total) * 100);
}

/** Host of an endpoint URL for compact tables. */
export function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** "21:26" today, "Yesterday 19:02", else "27 Sep 16:15", in the viewer's time zone. */
export function deliveryWhen(at: number, now: number, prefs: FormatPrefs): string {
  const day = formatDate(localDateOf(at, prefs.timeZone));
  const today = localDateOf(now, prefs.timeZone);
  const time = formatTime(at, prefs);
  if (day === formatDate(today)) return time;
  if (day === formatDate(addDays(today, -1))) return `Yesterday ${time}`;
  return `${new Intl.DateTimeFormat(prefs.locale, { timeZone: prefs.timeZone, day: "numeric", month: "short" }).format(at)} ${time}`;
}

/** One delivery log row, with every text formatted on the server (no locale/time work in the browser). */
export type DeliveryRow = {
  id: string;
  when: string;
  whenIso: string;
  trigger: string;
  endpoint: string;
  response: ResponsePill;
  duration: string;
  attempt: string;
  failed: boolean;
  /** Finally failed: the manual retry (API-003) applies. */
  retryable: boolean;
};

export function deliveryRow(
  d: DeliveryFacts & { id: string; url: string; trigger: string; latencyMs: number | null },
  ctx: { now: number; prefs: FormatPrefs; maxAttempts: number },
): DeliveryRow {
  return {
    id: d.id,
    when: deliveryWhen(d.createdAt.getTime(), ctx.now, ctx.prefs),
    whenIso: d.createdAt.toISOString(),
    trigger: d.trigger,
    endpoint: endpointHost(d.url),
    response: responsePill(d),
    duration: d.latencyMs === null ? "—" : `${d.latencyMs.toLocaleString(ctx.prefs.locale)} ms`,
    attempt: attemptText(d, ctx.maxAttempts),
    failed: d.status === "failed" || (d.status === "pending" && d.error !== null),
    retryable: d.status === "failed",
  };
}
