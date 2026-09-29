import { z } from "zod";
import { PHONE_PATTERN, type Question } from "@/features/event-types/schemas";

/**
 * Validation of booking-question answers (EVT-009), built from the event type's questions so
 * the same rules run in the browser and on the server. Unknown keys are dropped. Hidden
 * questions are optional and only filled through URL prefill (BKG-014).
 */

export type Answer = string | string[] | boolean | number;
export type Answers = Record<string, Answer>;

const text = (max: number) => z.string().trim().max(max);

function answerSchema(q: Question): z.ZodType<Answer | undefined> {
  const options = new Set(q.options);
  const oneOf = text(100).refine((v) => options.has(v), "Pick one of the options");
  const base: z.ZodType<Answer> = (() => {
    switch (q.type) {
      case "short_text":
        return text(500).min(1, "This field is required");
      case "long_text":
        return text(5000).min(1, "This field is required");
      case "number":
        // Coercion would turn "" and null into 0: only real numbers and numeric strings count.
        return z
          .union([z.number(), text(40).regex(/^-?\d+(\.\d+)?$/, "Enter a number")])
          .transform(Number)
          .pipe(z.number().finite("Enter a number"));
      case "email":
        return text(254).toLowerCase().email("Enter a valid email");
      case "phone":
        return text(40)
          .transform((v) => v.replace(/[\s()-]/g, ""))
          .refine((v) => PHONE_PATTERN.test(v), "Enter the number in international format, e.g. +90 555 123 4567");
      case "url":
        return text(2000).refine((v) => /^https?:\/\/\S+$/i.test(v), "Enter a valid http(s) link");
      case "select":
      case "radio":
        return oneOf;
      case "multi_select":
      case "checkbox":
        return z.array(oneOf).max(options.size).min(1, "Pick at least one option").transform((v) => [...new Set(v)]);
      case "boolean":
        return z.boolean();
    }
  })();
  // Empty values count as "not answered".
  const empty = z.union([z.literal(""), z.literal(null), z.undefined(), z.array(z.never()).length(0)]).transform(() => undefined);
  if (q.required && !q.hidden) {
    return q.type === "boolean" ? z.literal(true, { message: "This field is required" }) : (base as z.ZodType<Answer>);
  }
  return z.union([empty, base]).optional();
}

export function answersSchema(questions: readonly Question[]): z.ZodType<Answers> {
  const shape = Object.fromEntries(questions.map((q) => [q.key, answerSchema(q)]));
  return z
    .object(shape)
    .strip()
    .transform((v) => Object.fromEntries(Object.entries(v).filter(([, a]) => a !== undefined)) as Answers) as unknown as z.ZodType<Answers>;
}

/** Answers taken from URL parameters (BKG-014): only known keys, multi-values comma-separated. */
export function prefillAnswers(questions: readonly Question[], params: Record<string, string | string[] | undefined>): Answers {
  const out: Answers = {};
  for (const q of questions) {
    const raw = params[q.key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") continue;
    if (q.type === "boolean") out[q.key] = value === "true" || value === "1" || value === "yes";
    else if (q.type === "multi_select" || q.type === "checkbox") out[q.key] = value.split(",").map((v) => v.trim()).filter((v) => q.options.includes(v));
    else if (q.type === "select" || q.type === "radio") {
      if (q.options.includes(value)) out[q.key] = value;
    } else out[q.key] = value.slice(0, 2000);
  }
  return out;
}

/** utm_* parameters (BKG-014), capped in number and length. */
export function utmFrom(params: Record<string, string | string[] | undefined>): Record<string, string> | null {
  const entries = Object.entries(params)
    .filter(([k, v]) => /^utm_[a-z_]{1,30}$/.test(k) && typeof v === "string" && v.length > 0)
    .slice(0, 10)
    .map(([k, v]) => [k, (v as string).slice(0, 200)]);
  return entries.length ? Object.fromEntries(entries) : null;
}
