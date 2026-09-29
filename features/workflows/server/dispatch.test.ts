import { describe, expect, it } from "vitest";
import { workflowJobsFor } from "./dispatch";
import type { WorkflowRow } from "./service";

const wf = (trigger: WorkflowRow["trigger"], offsetMinutes = 0, extra: Partial<WorkflowRow> = {}): WorkflowRow => ({
  id: `w-${trigger}`,
  ownerUserId: "h",
  eventTypeId: "et",
  teamId: null,
  name: trigger,
  trigger,
  offsetMinutes,
  recipient: "attendees",
  address: null,
  subject: "s",
  body: "b",
  enabled: true,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});

const booking = { id: "b1", startAt: new Date("2026-10-05T09:00:00Z"), endAt: new Date("2026-10-05T09:30:00Z") };
const NOW = Date.parse("2026-10-01T00:00:00Z");
const all = [wf("booking_created"), wf("booking_cancelled"), wf("booking_rescheduled"), wf("before_start", 1440), wf("after_end", 60)];

describe("workflowJobsFor (NTF-005)", () => {
  it("a confirmed booking gets its immediate step and timed reminders", () => {
    const jobs = workflowJobsFor(all, "created", booking, NOW);
    expect(jobs.map((j) => [j.payload.workflowId, j.startAfter?.toISOString()])).toEqual([
      ["w-booking_created", undefined],
      ["w-before_start", "2026-10-04T09:00:00.000Z"],
      ["w-after_end", "2026-10-05T10:30:00.000Z"],
    ]);
  });

  it("pending bookings get nothing until accepted; cancellations only their own step", () => {
    expect(workflowJobsFor(all, "requested", booking, NOW)).toEqual([]);
    expect(workflowJobsFor(all, "accepted", booking, NOW)).toHaveLength(3);
    expect(workflowJobsFor(all, "cancelled", booking, NOW).map((j) => j.payload.workflowId)).toEqual(["w-booking_cancelled"]);
    expect(workflowJobsFor(all, "rejected", booking, NOW)).toEqual([]);
  });

  it("skips reminders whose time has passed and disabled workflows; ids are stable per start", () => {
    const late = workflowJobsFor(all, "created", booking, Date.parse("2026-10-05T08:00:00Z"));
    expect(late.map((j) => j.payload.workflowId)).not.toContain("w-before_start");
    expect(workflowJobsFor([wf("booking_created", 0, { enabled: false })], "created", booking, NOW)).toEqual([]);
    const again = workflowJobsFor(all, "created", booking, NOW);
    expect(again.map((j) => j.id)).toEqual(workflowJobsFor(all, "created", booking, NOW).map((j) => j.id));
    const moved = workflowJobsFor(all, "rescheduled", { ...booking, startAt: new Date("2026-10-06T09:00:00Z"), endAt: new Date("2026-10-06T09:30:00Z") }, NOW);
    expect(moved.find((j) => j.payload.workflowId === "w-before_start")!.id).not.toBe(again.find((j) => j.payload.workflowId === "w-before_start")!.id);
  });
});
