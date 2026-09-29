import { describe, expect, it } from "vitest";
import type { Question } from "@/features/event-types/schemas";
import { answersSchema, prefillAnswers, utmFrom } from "./responses";

const q = (key: string, type: Question["type"], extra: Partial<Question> = {}): Question => ({
  key,
  type,
  label: key,
  placeholder: null,
  required: false,
  hidden: false,
  options: [],
  ...extra,
});

const questions: Question[] = [
  q("company", "short_text", { required: true }),
  q("size", "select", { options: ["1-10", "11-50"] }),
  q("topics", "checkbox", { options: ["A", "B"] }),
  q("phone", "phone"),
  q("agree", "boolean", { required: true }),
  q("seats", "number"),
  q("campaign", "short_text", { hidden: true }),
];

describe("answersSchema (EVT-009)", () => {
  it("accepts valid answers, normalizes them and drops unknown keys", () => {
    const parsed = answersSchema(questions).parse({ company: " ACME ", size: "1-10", topics: ["A", "A"], phone: "+90 555 123 4567", agree: true, seats: "3", evil: "x" });
    expect(parsed).toEqual({ company: "ACME", size: "1-10", topics: ["A"], phone: "+905551234567", agree: true, seats: 3 });
  });

  it("rejects missing required answers and values outside the options", () => {
    const result = answersSchema(questions).safeParse({ company: "", size: "1000+", topics: ["C"], agree: false });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["company", "size", "topics", "agree"]));
  });

  it("a required number isn't satisfied by an empty value", () => {
    const schema = answersSchema([q("seats", "number", { required: true })]);
    for (const empty of ["", "  ", null, []]) expect(schema.safeParse({ seats: empty }).success).toBe(false);
    expect(schema.parse({ seats: "2.5" })).toEqual({ seats: 2.5 });
  });

  it("optional answers may be empty; hidden questions are never required", () => {
    expect(answersSchema(questions).parse({ company: "X", agree: true, size: "", topics: [], phone: "" })).toEqual({ company: "X", agree: true });
  });
});

describe("URL prefill (BKG-014)", () => {
  it("reads known question keys, validates choices and collects utm_* parameters", () => {
    expect(prefillAnswers(questions, { company: "ACME", size: "nope", topics: "A,C", agree: "yes", campaign: "fall", other: "x" })).toEqual({
      company: "ACME",
      topics: ["A"],
      agree: true,
      campaign: "fall",
    });
    expect(utmFrom({ utm_source: "newsletter", utm_medium: "email", name: "x", utm_BAD: "y" })).toEqual({ utm_source: "newsletter", utm_medium: "email" });
    expect(utmFrom({})).toBeNull();
  });
});
