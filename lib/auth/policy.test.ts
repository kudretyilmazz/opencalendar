import { describe, expect, it } from "vitest";
import { decideSignup, evaluateLockout, LOCKOUT_MAX_FAILURES, LOCKOUT_WINDOW_MS } from "./policy";

describe("decideSignup", () => {
  it("always allows the first user and makes them admin", () => {
    for (const mode of ["open", "invite_only", "disabled"] as const) {
      expect(decideSignup({ mode, existingUserCount: 0 })).toEqual({ allowed: true, role: "admin" });
    }
  });

  it("allows later users as regular users in open mode", () => {
    expect(decideSignup({ mode: "open", existingUserCount: 3 })).toEqual({
      allowed: true,
      role: "user",
    });
  });

  it("rejects later users when signup is disabled", () => {
    expect(decideSignup({ mode: "disabled", existingUserCount: 1 })).toEqual({
      allowed: false,
      reason: "SIGNUP_DISABLED",
    });
  });

  it("rejects uninvited users in invite-only mode", () => {
    expect(decideSignup({ mode: "invite_only", existingUserCount: 1 })).toEqual({
      allowed: false,
      reason: "INVITE_REQUIRED",
    });
    expect(decideSignup({ mode: "invite_only", existingUserCount: 1, invited: true })).toEqual({ allowed: true, role: "user" });
    expect(decideSignup({ mode: "disabled", existingUserCount: 1, invited: true })).toMatchObject({ allowed: false });
  });
});

describe("evaluateLockout", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("is not locked below the threshold", () => {
    const failures = Array.from({ length: LOCKOUT_MAX_FAILURES - 1 }, (_, i) => ago(i * 1000));
    expect(evaluateLockout(failures, now)).toEqual({ locked: false });
  });

  it("locks at the threshold and reports when it ends", () => {
    const failures = Array.from({ length: LOCKOUT_MAX_FAILURES }, (_, i) => ago(i * 60_000));
    const result = evaluateLockout(failures, now);
    expect(result.locked).toBe(true);
    // Lock lifts once the oldest failure that counts toward the threshold leaves the window.
    const oldestCounted = ago((LOCKOUT_MAX_FAILURES - 1) * 60_000);
    expect(result.locked && result.until.getTime()).toBe(oldestCounted.getTime() + LOCKOUT_WINDOW_MS);
  });

  it("ignores failures outside the window", () => {
    const failures = Array.from({ length: 20 }, () => ago(LOCKOUT_WINDOW_MS + 1));
    expect(evaluateLockout(failures, now)).toEqual({ locked: false });
  });

  it("does not depend on input order and does not mutate it", () => {
    const failures = Array.from({ length: LOCKOUT_MAX_FAILURES }, (_, i) => ago(i * 1000)).reverse();
    const copy = [...failures];
    expect(evaluateLockout(failures, now).locked).toBe(true);
    expect(failures).toEqual(copy);
  });
});
