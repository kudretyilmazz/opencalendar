import { describe, expect, it } from "vitest";
import type { RoutingField, RoutingRule } from "@/db/schema/routing";
import {
  actionLabel,
  fallbackTarget,
  referencedEventTypeIds,
  responseOutcome,
  responseSummary,
  responseWhen,
  routeLabels,
  ruleSummaries,
  trendBuckets,
  trendWindow,
} from "./overview";

const titles = { et1: "Product demo", et2: "Intro call" };
const fields: RoutingField[] = [
  { key: "company", label: "Company", type: "text", required: false, options: [] },
  { key: "name", label: "Your name", type: "text", required: false, options: [] },
  { key: "size", label: "Team size", type: "select", required: true, options: ["1-10", "51+"] },
  { key: "topic", label: "Topic", type: "text", required: false, options: [] },
  { key: "tags", label: "Tags", type: "multi_select", required: false, options: ["a", "b"] },
];
const rules: RoutingRule[] = [
  { id: "r1", match: "all", conditions: [{ field: "size", operator: "equals", value: ["51+"] }], action: { kind: "event_type", eventTypeId: "et1" } },
  {
    id: "r2",
    match: "any",
    conditions: [
      { field: "topic", operator: "contains", value: ["billing"] },
      { field: "gone", operator: "between", value: ["1", "5"] },
    ],
    action: { kind: "message", message: "Email billing@example.com" },
  },
  { id: "r3", match: "all", conditions: [{ field: "tags", operator: "in", value: ["a", "b"] }], action: { kind: "external_url", url: "https://crm.example.com/x" } },
];

describe("actionLabel / routeLabels", () => {
  it("names event types, messages and URL hosts", () => {
    expect(actionLabel({ kind: "event_type", eventTypeId: "et2" }, titles)).toBe("Intro call");
    expect(actionLabel({ kind: "event_type", eventTypeId: "nope" }, titles)).toBe("Deleted event type");
    expect(actionLabel({ kind: "message", message: "hi" }, titles)).toBe("Message");
    expect(actionLabel({ kind: "external_url", url: "https://a.example.org/p?q" }, titles)).toBe("a.example.org");
    expect(actionLabel({ kind: "external_url", url: "not a url" }, titles)).toBe("not a url");
  });

  it("lists distinct targets, rules first then the fallback", () => {
    expect(routeLabels({ rules, fallback: { kind: "event_type", eventTypeId: "et2" } }, titles)).toEqual([
      "Product demo",
      "Message",
      "crm.example.com",
      "Intro call",
    ]);
    expect(routeLabels({ rules: [], fallback: { kind: "message", message: "x" } }, titles)).toEqual(["Message"]);
  });

  it("collects referenced event type ids once", () => {
    expect(referencedEventTypeIds([{ rules, fallback: { kind: "event_type", eventTypeId: "et1" } }, { rules: [], fallback: { kind: "event_type", eventTypeId: "et2" } }])).toEqual(["et1", "et2"]);
  });
});

describe("trendBuckets / trendWindow", () => {
  it("fills ten 3-day buckets, oldest first, clamping out-of-range indexes", () => {
    const buckets = trendBuckets([
      { bucket: 0, count: 2 },
      { bucket: 9, count: 1 },
      { bucket: 10, count: 3 },
      { bucket: -1, count: 1 },
    ]);
    expect(buckets).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0, 4]);
    expect(trendBuckets([])).toHaveLength(10);
  });

  it("starts the window 30 days back with 3-day buckets", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    expect(trendWindow(now)).toEqual({ since: new Date("2026-08-31T12:00:00Z"), bucketSeconds: 259_200 });
  });
});

describe("responseSummary", () => {
  it("uses identifying answers as who and the rest as label: value", () => {
    expect(responseSummary(fields, { company: "Helio", name: "Jonas", size: "51+", tags: ["a", "b"] })).toEqual({
      who: "Helio · Jonas",
      answers: "Team size: 51+ · Tags: a, b",
    });
  });

  it("falls back to the first answer, or Anonymous", () => {
    expect(responseSummary(fields, { size: "1-10", topic: "rollout" })).toEqual({ who: "1-10", answers: "Topic: rollout" });
    expect(responseSummary(fields, {})).toEqual({ who: "Anonymous", answers: "" });
  });

  it("treats email fields as identifying", () => {
    const email: RoutingField = { key: "e", label: "Mail", type: "email", required: true, options: [] };
    expect(responseSummary([email, fields[3]], { e: "a@b.co", topic: "x" }).who).toBe("a@b.co");
  });
});

describe("ruleSummaries", () => {
  it("describes each rule in plain language", () => {
    const [r1, r2, r3] = ruleSummaries({ fields, rules }, titles);
    expect(r1).toEqual({ conditions: [{ field: "Team size", operator: "is", value: "51+" }], joiner: "and", target: "Product demo", kind: "event_type" });
    expect(r2.joiner).toBe("or");
    expect(r2.conditions).toEqual([
      { field: "Topic", operator: "contains", value: "billing" },
      { field: "gone", operator: "is between", value: "1 and 5" },
    ]);
    expect(r2.target).toBe("Email billing@example.com");
    expect(r3.conditions[0].value).toBe("a, b");
    expect(r3.target).toBe("crm.example.com");
  });

  it("describes the fallback", () => {
    expect(fallbackTarget({ kind: "message", message: "Thanks" }, titles)).toBe("Thanks");
    expect(fallbackTarget({ kind: "event_type", eventTypeId: "et2" }, titles)).toBe("Intro call");
  });
});

describe("responseOutcome", () => {
  it("prefers the booking, then the routed target", () => {
    expect(responseOutcome({ kind: "event_type", eventTypeId: "et2" }, titles, "Intro call")).toEqual({ label: "Booked · Intro call", kind: "booked" });
    expect(responseOutcome({ kind: "event_type", eventTypeId: "et1" }, titles, null)).toEqual({ label: "→ Product demo", kind: "event" });
    expect(responseOutcome({ kind: "message", message: "x" }, titles, null)).toEqual({ label: "→ Message", kind: "message" });
  });
});

describe("responseWhen", () => {
  const prefs = { locale: "en-GB", timeZone: "Europe/Berlin", hour12: false };
  const now = Date.parse("2026-09-30T10:00:00Z");

  it("says today and yesterday in the viewer's time zone, else a short date", () => {
    expect(responseWhen(Date.parse("2026-09-30T08:05:00Z"), now, prefs)).toBe("Today 10:05");
    expect(responseWhen(Date.parse("2026-09-29T21:30:00Z"), now, prefs)).toBe("Yesterday 23:30");
    expect(responseWhen(Date.parse("2026-09-29T22:30:00Z"), now, prefs)).toBe("Today 0:30");
    expect(responseWhen(Date.parse("2026-09-27T12:00:00Z"), now, prefs)).toBe("27 Sept");
  });
});
