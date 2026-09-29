import { z } from "zod";
import type { RoutingAction, RoutingAnswers, RoutingField, RoutingFieldType, RoutingOperator } from "@/db/schema/routing";

/**
 * Validation for routing forms (RTE-001…003) and their submissions (RTE-005). The editor payload
 * and the submission are validated with the same schemas in the browser and on the server.
 */

export const FIELD_TYPES = ["text", "email", "phone", "number", "select", "multi_select", "radio"] as const satisfies readonly RoutingFieldType[];
export const FIELD_LABELS: Record<RoutingFieldType, string> = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  select: "Dropdown",
  multi_select: "Multiple choice (checkboxes)",
  radio: "Single choice (radio buttons)",
};
export const FIELD_HAS_OPTIONS: ReadonlySet<RoutingFieldType> = new Set(["select", "multi_select", "radio"]);

export const OPERATORS = ["equals", "not_equals", "contains", "in", "gt", "lt", "between"] as const satisfies readonly RoutingOperator[];
export const OPERATOR_LABELS: Record<RoutingOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  in: "is one of",
  gt: "is greater than",
  lt: "is less than",
  between: "is between",
};

/** Operators that make sense for a field type (the editor only offers these). */
export function operatorsFor(type: RoutingFieldType): RoutingOperator[] {
  if (type === "number") return ["equals", "not_equals", "gt", "lt", "between", "in"];
  if (FIELD_HAS_OPTIONS.has(type)) return ["equals", "not_equals", "in"];
  return ["equals", "not_equals", "contains", "in"];
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const PHONE_LIKE = /^\+?[0-9 ()-]{6,20}$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export const MAX_FIELDS = 50;
export const MAX_RULES = 50;
export const MAX_CONDITIONS = 20;
export const MAX_VALUES = 50;
export const MAX_OPTIONS = 50;

const fieldSchema = z
  .object({
    key: z.string().trim().regex(KEY_PATTERN, "Use lowercase letters, digits and underscores, starting with a letter"),
    label: z.string().trim().min(1, "Enter a label").max(200),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1, "Options can't be empty").max(200)).max(MAX_OPTIONS).default([]),
  })
  .superRefine((f, ctx) => {
    if (FIELD_HAS_OPTIONS.has(f.type)) {
      if (f.options.length === 0) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one option" });
      if (new Set(f.options).size !== f.options.length) ctx.addIssue({ code: "custom", path: ["options"], message: "Options must be different" });
    }
  })
  .transform((f): RoutingField => ({ ...f, options: FIELD_HAS_OPTIONS.has(f.type) ? f.options : [] }));

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https:\/\/[^\s]+$/i.test(v), "Enter an https:// address");

export const actionSchema: z.ZodType<RoutingAction> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event_type"), eventTypeId: z.string().min(1, "Pick an event type").max(64) }),
  z.object({ kind: z.literal("external_url"), url: httpsUrl }),
  z.object({ kind: z.literal("message"), message: z.string().trim().min(1, "Enter a message").max(1000) }),
]);

const conditionSchema = z
  .object({
    field: z.string().max(40),
    operator: z.enum(OPERATORS),
    value: z.array(z.string().trim().min(1, "Enter a value").max(200)).max(MAX_VALUES),
  })
  .superRefine((c, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", path: ["value"], message });
    if (c.operator === "in") {
      if (c.value.length === 0) bad("Enter at least one value");
    } else if (c.operator === "between") {
      const [lo, hi] = c.value;
      if (c.value.length !== 2 || !NUMERIC.test(lo) || !NUMERIC.test(hi)) bad("Enter two numbers");
      else if (Number(lo) > Number(hi)) bad("The first number must not exceed the second");
    } else if (c.value.length !== 1) {
      bad("Enter a value");
    } else if ((c.operator === "gt" || c.operator === "lt") && !NUMERIC.test(c.value[0])) {
      bad("Enter a number");
    }
  });

const ruleSchema = z.object({
  id: z.string().trim().min(1).max(64),
  match: z.enum(["all", "any"]),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition").max(MAX_CONDITIONS),
  action: actionSchema,
});

/** The editor payload (RTE-001…003). The owner (`teamId`) is only set when creating. */
export const routingFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(100),
    description: z.string().trim().max(500).nullable().default(null),
    fields: z.array(fieldSchema).max(MAX_FIELDS),
    rules: z.array(ruleSchema).max(MAX_RULES),
    fallback: actionSchema,
    disabled: z.boolean().default(false),
  })
  .superRefine((form, ctx) => {
    const keys = new Set<string>();
    form.fields.forEach((f, i) => {
      if (keys.has(f.key)) ctx.addIssue({ code: "custom", path: ["fields", i, "key"], message: "Identifiers must be unique" });
      keys.add(f.key);
    });
    const ruleIds = new Set<string>();
    form.rules.forEach((rule, i) => {
      if (ruleIds.has(rule.id)) ctx.addIssue({ code: "custom", path: ["rules", i, "id"], message: "Duplicate rule" });
      ruleIds.add(rule.id);
      rule.conditions.forEach((c, j) => {
        if (!keys.has(c.field)) ctx.addIssue({ code: "custom", path: ["rules", i, "conditions", j, "field"], message: "Pick a field" });
      });
    });
  })
  .transform((v) => ({ ...v, description: v.description || null }));

export type RoutingFormInput = z.output<typeof routingFormSchema>;
export type RoutingFormDraft = z.input<typeof routingFormSchema>;

export const createRoutingFormSchema = z.object({ teamId: z.string().min(1).max(64).nullable().default(null), form: routingFormSchema });

export const DEFAULT_ROUTING_FORM: RoutingFormInput = {
  name: "",
  description: null,
  fields: [],
  rules: [],
  fallback: { kind: "message", message: "Thanks! We will get back to you soon." },
  disabled: false,
};

const text = (max: number) => z.string().trim().max(max);

function valueSchema(f: RoutingField): z.ZodType<string | string[] | number> {
  const options = new Set(f.options);
  const oneOf = text(200).refine((v) => options.has(v), "Pick one of the options");
  switch (f.type) {
    case "text":
      return text(500).min(1, "This field is required");
    case "email":
      return text(254).toLowerCase().pipe(z.email("Enter a valid email"));
    case "phone":
      return text(40).regex(PHONE_LIKE, "Enter a valid phone number");
    case "number":
      // Coercion would turn "" into 0: only real numbers and numeric strings count.
      return z
        .union([z.number(), text(40).regex(NUMERIC, "Enter a number")])
        .transform(Number)
        .pipe(z.number().finite("Enter a number"));
    case "select":
    case "radio":
      return oneOf;
    case "multi_select":
      return z.array(oneOf).min(1, "Pick at least one option").max(MAX_OPTIONS).transform((v) => [...new Set(v)]);
  }
}

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Validates a submission against the form's fields; unknown keys are dropped and empty answers
 * omitted. Written by hand instead of as a z.object so that every problem is reported per field
 * with its own message rather than as a generic union error.
 */
export function answersSchema(fields: readonly RoutingField[]): z.ZodType<RoutingAnswers> {
  const schemas = fields.map((f) => [f, valueSchema(f)] as const);
  return z.unknown().transform((raw, ctx): RoutingAnswers => {
    const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const out: RoutingAnswers = {};
    for (const [f, schema] of schemas) {
      const value = input[f.key];
      if (isEmpty(value)) {
        if (f.required) ctx.addIssue({ code: "custom", path: [f.key], message: "This field is required" });
        continue;
      }
      const parsed = schema.safeParse(value);
      if (parsed.success) out[f.key] = parsed.data;
      else ctx.addIssue({ code: "custom", path: [f.key], message: parsed.error.issues[0]?.message ?? "Invalid value" });
    }
    return out;
  });
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Unvalidated answers from URL parameters (RTE-006 headless routing and page prefill). Only known
 * keys are read; multi-selects accept repeated parameters and/or comma-separated values, every
 * other type takes the first value. Validation is `answersSchema`'s job.
 */
export function rawAnswersFromParams(fields: readonly RoutingField[], params: Params): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of fields) {
    const raw = params[f.key];
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (f.type === "multi_select") out[f.key] = values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    else if (values[0] !== undefined && values[0] !== "") out[f.key] = values[0].slice(0, 2000);
  }
  return out;
}
