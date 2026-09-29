import type { RoutingAction, RoutingAnswers, RoutingCondition, RoutingRule, RoutingTraceStep } from "@/db/schema/routing";

/**
 * Pure routing evaluation (RTE-002, RTE-003, RTE-005). Rules run in order, the first match wins,
 * and the trace lists every rule looked at up to and including the match. Nothing here touches
 * the database or the clock, so a stored trace can always be reproduced from the stored answers.
 */

export type RoutingOutcome = { action: RoutingAction; matchedRuleId: string | null; trace: RoutingTraceStep[] };

const norm = (v: string): string => v.trim().toLowerCase();

/** An answer as a list of normalized strings; empty when unanswered. */
function asList(answer: string | string[] | number | undefined): string[] {
  if (answer === undefined) return [];
  const items = Array.isArray(answer) ? answer : [answer];
  return items.map((v) => norm(String(v))).filter((v) => v !== "");
}

/** Finite number or null: "" and whitespace must not turn into 0. */
function toNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const numeric = (items: string[], test: (n: number) => boolean): boolean =>
  items.some((item) => {
    const n = toNumber(item);
    return n !== null && test(n);
  });

/**
 * A missing answer makes every condition false except `not_equals`, which is true ("the answer
 * is not X" holds when there is no answer), so "not equals" rules can route people who skipped
 * an optional question. Multi-select: equals/in/contains match if ANY selected option matches;
 * not_equals holds only if NONE of the selected options equals the value.
 */
export function conditionMatches(condition: RoutingCondition, answers: RoutingAnswers): boolean {
  const items = asList(answers[condition.field]);
  const values = condition.value.map(norm);
  const [first] = values;
  switch (condition.operator) {
    case "equals":
      return first !== undefined && items.includes(first);
    case "not_equals":
      return first === undefined || !items.includes(first);
    case "contains":
      return first !== undefined && first !== "" && items.some((item) => item.includes(first));
    case "in":
      return items.some((item) => values.includes(item));
    case "gt": {
      const limit = first === undefined ? null : toNumber(first);
      return limit !== null && numeric(items, (n) => n > limit);
    }
    case "lt": {
      const limit = first === undefined ? null : toNumber(first);
      return limit !== null && numeric(items, (n) => n < limit);
    }
    case "between": {
      const lo = values[0] === undefined ? null : toNumber(values[0]);
      const hi = values[1] === undefined ? null : toNumber(values[1]);
      return lo !== null && hi !== null && numeric(items, (n) => n >= lo && n <= hi);
    }
  }
}

/** A rule without conditions never matches: "all of nothing" must not swallow every submission. */
export function ruleMatches(rule: Pick<RoutingRule, "match" | "conditions">, answers: RoutingAnswers): boolean {
  if (rule.conditions.length === 0) return false;
  const test = (c: RoutingCondition) => conditionMatches(c, answers);
  return rule.match === "all" ? rule.conditions.every(test) : rule.conditions.some(test);
}

export function evaluateRouting(
  form: { rules: readonly RoutingRule[]; fallback: RoutingAction },
  answers: RoutingAnswers,
): RoutingOutcome {
  const trace: RoutingTraceStep[] = [];
  for (const rule of form.rules) {
    const matched = ruleMatches(rule, answers);
    trace.push({ ruleId: rule.id, matched });
    if (matched) return { action: rule.action, matchedRuleId: rule.id, trace };
  }
  return { action: form.fallback, matchedRuleId: null, trace };
}
