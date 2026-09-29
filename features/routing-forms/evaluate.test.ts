import { describe, expect, it } from "vitest";
import type { RoutingAction, RoutingCondition, RoutingOperator, RoutingRule } from "@/db/schema/routing";
import { conditionMatches, evaluateRouting, ruleMatches } from "./evaluate";

const msg = (message: string): RoutingAction => ({ kind: "message", message });
const cond = (operator: RoutingOperator, value: string[], field = "f"): RoutingCondition => ({ field, operator, value });
const test = (c: RoutingCondition, answer: string | string[] | number | undefined) => conditionMatches(c, answer === undefined ? {} : { f: answer });

describe("conditionMatches", () => {
  it("equals ignores case and surrounding whitespace", () => {
    expect(test(cond("equals", ["Sales"]), "  sales ")).toBe(true);
    expect(test(cond("equals", ["Sales"]), "support")).toBe(false);
    expect(test(cond("equals", ["5"]), 5)).toBe(true);
  });

  it("equals on a multi-select matches any selected option", () => {
    expect(test(cond("equals", ["b"]), ["a", "B"])).toBe(true);
    expect(test(cond("equals", ["c"]), ["a", "B"])).toBe(false);
  });

  it("equals is false for a missing answer, an empty list or a condition without value", () => {
    expect(test(cond("equals", ["a"]), undefined)).toBe(false);
    expect(test(cond("equals", ["a"]), [])).toBe(false);
    expect(test(cond("equals", []), "a")).toBe(false);
  });

  it("not_equals is true for a missing answer and when no selected option equals", () => {
    expect(test(cond("not_equals", ["a"]), undefined)).toBe(true);
    expect(test(cond("not_equals", ["a"]), "b")).toBe(true);
    expect(test(cond("not_equals", ["a"]), "A")).toBe(false);
    expect(test(cond("not_equals", ["a"]), ["b", "a"])).toBe(false);
    expect(test(cond("not_equals", ["a"]), ["b", "c"])).toBe(true);
    expect(test(cond("not_equals", []), "a")).toBe(true);
  });

  it("contains is a case-insensitive substring match", () => {
    expect(test(cond("contains", ["corp"]), "ACME Corporation")).toBe(true);
    expect(test(cond("contains", ["xyz"]), "ACME")).toBe(false);
    expect(test(cond("contains", ["corp"]), ["one", "Megacorp"])).toBe(true);
    expect(test(cond("contains", ["corp"]), undefined)).toBe(false);
    expect(test(cond("contains", []), "abc")).toBe(false);
    expect(test(cond("contains", [" "]), "abc")).toBe(false);
  });

  it("in matches when the answer, or any selected option, is in the list", () => {
    expect(test(cond("in", ["a", "b"]), "B")).toBe(true);
    expect(test(cond("in", ["a", "b"]), "c")).toBe(false);
    expect(test(cond("in", ["a", "b"]), ["c", "a"])).toBe(true);
    expect(test(cond("in", ["a", "b"]), ["c", "d"])).toBe(false);
    expect(test(cond("in", ["a"]), undefined)).toBe(false);
  });

  it("gt and lt compare numerically", () => {
    expect(test(cond("gt", ["10"]), 11)).toBe(true);
    expect(test(cond("gt", ["10"]), 10)).toBe(false);
    expect(test(cond("gt", ["10"]), "9")).toBe(false); // numeric, not lexicographic
    expect(test(cond("lt", ["10"]), "9")).toBe(true);
    expect(test(cond("lt", ["10"]), 10)).toBe(false);
  });

  it("gt and lt are false for non-numeric answers, missing answers and bad thresholds", () => {
    expect(test(cond("gt", ["10"]), "abc")).toBe(false);
    expect(test(cond("gt", ["10"]), undefined)).toBe(false);
    expect(test(cond("lt", ["10"]), "   ")).toBe(false);
    expect(test(cond("gt", ["abc"]), 5)).toBe(false);
    expect(test(cond("lt", []), 5)).toBe(false);
    expect(test(cond("gt", []), 5)).toBe(false);
  });

  it("between is inclusive on both ends", () => {
    const c = cond("between", ["10", "20"]);
    expect(test(c, 10)).toBe(true);
    expect(test(c, 20)).toBe(true);
    expect(test(c, "15.5")).toBe(true);
    expect(test(c, 9.99)).toBe(false);
    expect(test(c, 21)).toBe(false);
    expect(test(c, undefined)).toBe(false);
  });

  it("between is false when a bound is missing or not a number", () => {
    expect(test(cond("between", ["10"]), 12)).toBe(false);
    expect(test(cond("between", []), 12)).toBe(false);
    expect(test(cond("between", ["x", "20"]), 12)).toBe(false);
    expect(test(cond("between", ["10", "y"]), 12)).toBe(false);
  });

  it("reads only the condition's own field", () => {
    expect(conditionMatches(cond("equals", ["a"], "other"), { f: "a" })).toBe(false);
  });
});

describe("ruleMatches", () => {
  const conditions = [cond("equals", ["a"], "x"), cond("equals", ["b"], "y")];
  it("all requires every condition", () => {
    expect(ruleMatches({ match: "all", conditions }, { x: "a", y: "b" })).toBe(true);
    expect(ruleMatches({ match: "all", conditions }, { x: "a", y: "c" })).toBe(false);
  });
  it("any requires one condition", () => {
    expect(ruleMatches({ match: "any", conditions }, { x: "z", y: "b" })).toBe(true);
    expect(ruleMatches({ match: "any", conditions }, { x: "z", y: "c" })).toBe(false);
  });
  it("a rule without conditions never matches", () => {
    expect(ruleMatches({ match: "all", conditions: [] }, {})).toBe(false);
    expect(ruleMatches({ match: "any", conditions: [] }, {})).toBe(false);
  });
});

describe("evaluateRouting", () => {
  const rule = (id: string, value: string, action: RoutingAction): RoutingRule => ({
    id,
    match: "all",
    conditions: [cond("equals", [value], "team")],
    action,
  });
  const form = { rules: [rule("r1", "sales", msg("sales")), rule("r2", "support", msg("support")), rule("r3", "support", msg("later"))], fallback: msg("fallback") };

  it("returns the first matching rule and traces every rule up to it", () => {
    expect(evaluateRouting(form, { team: "support" })).toEqual({
      action: msg("support"),
      matchedRuleId: "r2",
      trace: [
        { ruleId: "r1", matched: false },
        { ruleId: "r2", matched: true },
      ],
    });
  });

  it("stops at the first rule when it matches", () => {
    const out = evaluateRouting(form, { team: "Sales" });
    expect(out.matchedRuleId).toBe("r1");
    expect(out.trace).toEqual([{ ruleId: "r1", matched: true }]);
  });

  it("uses the fallback when nothing matches and traces all rules", () => {
    expect(evaluateRouting(form, { team: "other" })).toEqual({
      action: msg("fallback"),
      matchedRuleId: null,
      trace: [
        { ruleId: "r1", matched: false },
        { ruleId: "r2", matched: false },
        { ruleId: "r3", matched: false },
      ],
    });
  });

  it("uses the fallback with an empty trace when there are no rules", () => {
    expect(evaluateRouting({ rules: [], fallback: msg("fb") }, {})).toEqual({ action: msg("fb"), matchedRuleId: null, trace: [] });
  });

  it("does not mutate its inputs", () => {
    const answers = { team: "support" };
    const snapshot = JSON.stringify([form, answers]);
    evaluateRouting(form, answers);
    expect(JSON.stringify([form, answers])).toBe(snapshot);
  });
});
