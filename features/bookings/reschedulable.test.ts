import { describe, expect, it } from "vitest";
import { canRequestReschedule } from "./reschedulable";

const movable = { recurringSeriesId: null, manageTokenSealed: "sealed" };
const plain = { disableRescheduling: false, seatsPerSlot: null };

describe("canRequestReschedule (BKG-010)", () => {
  it("allows a single booking whose invitee can reschedule", () => {
    expect(canRequestReschedule(movable, plain)).toBe(true);
  });

  it("refuses what the invitee's reschedule link can't move", () => {
    expect(canRequestReschedule({ ...movable, recurringSeriesId: "s1" }, plain)).toBe(false);
    expect(canRequestReschedule(movable, { ...plain, seatsPerSlot: 5 })).toBe(false);
    expect(canRequestReschedule(movable, { ...plain, disableRescheduling: true })).toBe(false);
  });

  it("needs the sealed manage token to build the link", () => {
    expect(canRequestReschedule({ ...movable, manageTokenSealed: null }, plain)).toBe(false);
  });
});
