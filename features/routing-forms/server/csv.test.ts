import { describe, expect, it } from "vitest";
import type { RoutingField } from "@/db/schema/routing";
import { csvCell, responsesCsv } from "./csv";

describe("csvCell", () => {
  it("quotes cells with commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("neutralizes formulas in strings but not real numbers", () => {
    for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=x"]) expect(csvCell(s).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("responsesCsv", () => {
  const fields: RoutingField[] = [
    { key: "name", label: "Name", type: "text", required: true, options: [] },
    { key: "tags", label: "Tags", type: "multi_select", required: false, options: ["a", "b"] },
  ];
  it("writes a header, one line per response and CRLF endings", () => {
    const csv = responsesCsv(fields, [
      {
        id: "1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        answers: { name: "=cmd|' /C calc'!A0", tags: ["a", "b"] },
        trace: [{ ruleId: "r1", matched: true }],
        matchedRuleId: "r1",
        action: { kind: "message", message: "Hi, there" },
      },
      { id: "2", createdAt: new Date("2026-01-02T00:00:00Z"), answers: {}, trace: [], matchedRuleId: null, action: { kind: "external_url", url: "https://x.test" } },
    ]);
    expect(csv.split("\r\n")).toEqual([
      "submitted_at,name,tags,matched_rule,trace,target",
      "2026-01-01T00:00:00.000Z,'=cmd|' /C calc'!A0,a; b,r1,r1:match,\"Hi, there\"",
      "2026-01-02T00:00:00.000Z,,,fallback,,https://x.test",
      "",
    ]);
  });
});
