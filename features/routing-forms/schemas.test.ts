import { describe, expect, it } from "vitest";
import type { RoutingField } from "@/db/schema/routing";
import { answersSchema, operatorsFor, rawAnswersFromParams, routingFormSchema } from "./schemas";

const field = (patch: Partial<RoutingField> = {}): RoutingField => ({ key: "size", label: "Size", type: "text", required: false, options: [], ...patch });
const form = (patch: Record<string, unknown> = {}) => ({
  name: "Contact",
  description: "",
  fields: [field()],
  rules: [],
  fallback: { kind: "message", message: "Thanks" },
  ...patch,
});
const issues = (input: unknown) => {
  const r = routingFormSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("routingFormSchema", () => {
  it("accepts a valid form and normalizes an empty description", () => {
    const r = routingFormSchema.parse(form());
    expect(r.description).toBeNull();
    expect(r.disabled).toBe(false);
  });

  it("requires a fallback (RTE-003)", () => {
    expect(issues({ ...form(), fallback: undefined }).some((m) => m.startsWith("fallback"))).toBe(true);
  });

  it("validates field keys and uniqueness", () => {
    expect(issues(form({ fields: [field({ key: "Bad Key" })] }))[0]).toMatch(/^fields\.0\.key/);
    expect(issues(form({ fields: [field({ key: "1a" })] }))).not.toEqual([]);
    expect(issues(form({ fields: [field({ key: "a".repeat(41) })] }))).not.toEqual([]);
    expect(issues(form({ fields: [field(), field()] }))).toContain("fields.1.key: Identifiers must be unique");
  });

  it("requires options for choice fields and drops them for others", () => {
    expect(issues(form({ fields: [field({ type: "select" })] }))).toContain("fields.0.options: Add at least one option");
    expect(issues(form({ fields: [field({ type: "radio", options: ["a", "a"] })] }))).toContain("fields.0.options: Options must be different");
    expect(issues(form({ fields: [field({ type: "radio", options: Array.from({ length: 51 }, (_, i) => `o${i}`) })] }))).not.toEqual([]);
    expect(routingFormSchema.parse(form({ fields: [field({ type: "text", options: ["x"] })] })).fields[0].options).toEqual([]);
  });

  it("limits label length", () => {
    expect(issues(form({ fields: [field({ label: "x".repeat(201) })] }))).not.toEqual([]);
    expect(issues(form({ fields: [field({ label: " " })] }))).not.toEqual([]);
  });

  const rule = (patch: Record<string, unknown> = {}) => ({
    id: "r1",
    match: "all",
    conditions: [{ field: "size", operator: "equals", value: ["big"] }],
    action: { kind: "message", message: "hi" },
    ...patch,
  });

  it("validates rules: existing fields, unique ids, at least one condition", () => {
    expect(issues(form({ rules: [rule()] }))).toEqual([]);
    expect(issues(form({ rules: [rule({ conditions: [{ field: "nope", operator: "equals", value: ["x"] }] })] }))).toContain("rules.0.conditions.0.field: Pick a field");
    expect(issues(form({ rules: [rule(), rule()] }))).toContain("rules.1.id: Duplicate rule");
    expect(issues(form({ rules: [rule({ conditions: [] })] }))).not.toEqual([]);
  });

  it("enforces operator value shapes", () => {
    const check = (operator: string, value: string[]) => issues(form({ rules: [rule({ conditions: [{ field: "size", operator, value }] })] }));
    expect(check("equals", [])).not.toEqual([]);
    expect(check("in", [])).not.toEqual([]);
    expect(check("in", ["a", "b"])).toEqual([]);
    expect(check("gt", ["x"])).not.toEqual([]);
    expect(check("lt", ["3"])).toEqual([]);
    expect(check("between", ["1"])).not.toEqual([]);
    expect(check("between", ["a", "2"])).not.toEqual([]);
    expect(check("between", ["5", "2"])).not.toEqual([]);
    expect(check("between", ["2", "5"])).toEqual([]);
  });

  it("limits rules, conditions and values", () => {
    expect(issues(form({ rules: Array.from({ length: 51 }, (_, i) => rule({ id: `r${i}` })) }))).not.toEqual([]);
    const many = Array.from({ length: 21 }, () => ({ field: "size", operator: "equals", value: ["x"] }));
    expect(issues(form({ rules: [rule({ conditions: many })] }))).not.toEqual([]);
    const values = Array.from({ length: 51 }, (_, i) => `v${i}`);
    expect(issues(form({ rules: [rule({ conditions: [{ field: "size", operator: "in", value: values }] })] }))).not.toEqual([]);
  });

  it("only accepts https external URLs and known action kinds", () => {
    const withAction = (action: unknown) => issues(form({ fallback: action }));
    expect(withAction({ kind: "external_url", url: "https://example.com/x" })).toEqual([]);
    expect(withAction({ kind: "external_url", url: "http://example.com" })).not.toEqual([]);
    expect(withAction({ kind: "external_url", url: "javascript:alert(1)" })).not.toEqual([]);
    expect(withAction({ kind: "event_type", eventTypeId: "" })).not.toEqual([]);
    expect(withAction({ kind: "event_type", eventTypeId: "abc" })).toEqual([]);
    expect(withAction({ kind: "message", message: " " })).not.toEqual([]);
    expect(withAction({ kind: "other" })).not.toEqual([]);
  });
});

describe("operatorsFor", () => {
  it("offers numeric operators for numbers and no contains for choices", () => {
    expect(operatorsFor("number")).toContain("between");
    expect(operatorsFor("select")).not.toContain("contains");
    expect(operatorsFor("text")).toContain("contains");
  });
});

describe("answersSchema", () => {
  const fields: RoutingField[] = [
    field({ key: "name", type: "text", required: true }),
    field({ key: "mail", type: "email" }),
    field({ key: "tel", type: "phone" }),
    field({ key: "seats", type: "number" }),
    field({ key: "plan", type: "select", options: ["free", "pro"] }),
    field({ key: "tier", type: "radio", options: ["a", "b"], required: true }),
    field({ key: "tags", type: "multi_select", options: ["x", "y", "z"] }),
  ];
  const schema = answersSchema(fields);
  const ok = { name: "Ada", tier: "a" };
  const err = (input: unknown) => {
    const r = schema.safeParse(input);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
  };

  it("accepts valid answers, normalizes them and drops unknown keys", () => {
    const r = schema.parse({ ...ok, mail: " Ada@Example.COM ", tel: "+90 555 123 4567", seats: "12", plan: "pro", tags: ["x", "x", "z"], extra: "no" });
    expect(r).toEqual({ name: "Ada", tier: "a", mail: "ada@example.com", tel: "+90 555 123 4567", seats: 12, plan: "pro", tags: ["x", "z"] });
  });

  it("requires required fields, treating empty values as missing", () => {
    expect(err({})).toEqual({ name: "This field is required", tier: "This field is required" });
    expect(err({ name: "  ", tier: "" })).toEqual({ name: "This field is required", tier: "This field is required" });
  });

  it("omits empty optional answers", () => {
    expect(schema.parse({ ...ok, mail: "", tel: null, tags: [] })).toEqual(ok);
  });

  it("validates each field type", () => {
    expect(err({ ...ok, mail: "nope" }).mail).toBe("Enter a valid email");
    expect(err({ ...ok, tel: "abc" }).tel).toBeDefined();
    expect(err({ ...ok, tel: "12" }).tel).toBeDefined();
    expect(err({ ...ok, seats: "abc" }).seats).toBe("Enter a number");
    expect(schema.parse({ ...ok, seats: 3.5 }).seats).toBe(3.5);
    expect(schema.parse({ ...ok, seats: "-2" }).seats).toBe(-2);
    expect(err({ ...ok, plan: "gold" }).plan).toBe("Pick one of the options");
    expect(err({ ...ok, tags: ["x", "q"] })["tags.1"] ?? err({ ...ok, tags: ["x", "q"] }).tags).toBeDefined();
    expect(err({ ...ok, name: "x".repeat(501) }).name).toBeDefined();
  });

  it("tolerates a non-object input", () => {
    expect(err(null)).toEqual({ name: "This field is required", tier: "This field is required" });
    expect(err([1])).toEqual({ name: "This field is required", tier: "This field is required" });
  });
});

describe("rawAnswersFromParams", () => {
  const fields: RoutingField[] = [field({ key: "name" }), field({ key: "tags", type: "multi_select", options: ["a", "b", "c"] })];
  it("reads known keys, first value for scalars", () => {
    expect(rawAnswersFromParams(fields, { name: ["Ada", "Bob"], other: "x" })).toEqual({ name: "Ada" });
  });
  it("accepts repeated and comma separated multi-select values", () => {
    expect(rawAnswersFromParams(fields, { tags: ["a,b", "c"] })).toEqual({ tags: ["a", "b", "c"] });
    expect(rawAnswersFromParams(fields, { tags: "a, b" })).toEqual({ tags: ["a", "b"] });
  });
  it("skips empty values", () => {
    expect(rawAnswersFromParams(fields, { name: "", tags: undefined })).toEqual({});
  });
});
