import type { RoutingAnswers, RoutingField, RoutingAction, RoutingTraceStep } from "@/db/schema/routing";

/** CSV export of routing-form responses (RTE-005), RFC 4180 with spreadsheet formula neutralization. */

export type CsvResponse = {
  id: string;
  createdAt: Date;
  answers: RoutingAnswers;
  trace: RoutingTraceStep[];
  matchedRuleId: string | null;
  action: RoutingAction;
};

/**
 * Cells starting with = + - @ (or tab/CR) are executed as formulas by spreadsheets, which lets a
 * public submitter attack whoever opens the export. A leading quote makes them plain text.
 */
export function csvCell(value: string | number): string {
  const raw = String(value);
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function describeAction(action: RoutingAction): string {
  if (action.kind === "event_type") return `event type ${action.eventTypeId}`;
  return action.kind === "external_url" ? action.url : action.message;
}

const answerCell = (value: RoutingAnswers[string] | undefined): string | number =>
  value === undefined ? "" : Array.isArray(value) ? value.join("; ") : value;

export function responsesCsv(fields: readonly RoutingField[], rows: readonly CsvResponse[]): string {
  const header = ["submitted_at", ...fields.map((f) => f.key), "matched_rule", "trace", "target"];
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      ...fields.map((f) => answerCell(r.answers[f.key])),
      r.matchedRuleId ?? "fallback",
      r.trace.map((s) => `${s.ruleId}:${s.matched ? "match" : "no"}`).join(" "),
      describeAction(r.action),
    ]
      .map(csvCell)
      .join(","),
  );
  return `${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
