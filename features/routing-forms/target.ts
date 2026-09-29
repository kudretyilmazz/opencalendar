import type { RoutingAnswers, RoutingField } from "@/db/schema/routing";

/**
 * Target URL of an event-type route with booking-form prefill (RTE-004). The booking page reads
 * multi-select answers as one comma-separated value (`prefillAnswers`), so that is what we emit.
 */

/** Parameters the booking page interprets itself: an answer must never be able to set them. */
const RESERVED = new Set(["routing", "reschedule", "token", "link", "embed", "theme", "brand", "hideDetails", "layout", "duration", "date", "notes"]);

export function bookingUrlWithPrefill(
  path: string,
  input: { questionKeys: readonly string[]; fields: readonly RoutingField[]; answers: RoutingAnswers; responseId: string },
): string {
  const accepted = new Set(input.questionKeys);
  const declared = new Set(input.fields.map((f) => f.key));
  // name and email are always asked by the booking form, so they prefill without being a question.
  for (const key of ["name", "email"]) if (declared.has(key)) accepted.add(key);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input.answers)) {
    if (!accepted.has(key) || RESERVED.has(key) || key.startsWith("utm_")) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  params.set("routing", input.responseId);
  return `${path}?${params.toString()}`;
}
