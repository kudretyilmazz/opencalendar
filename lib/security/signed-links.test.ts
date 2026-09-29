import { describe, expect, it } from "vitest";
import { signAction, verifyAction } from "./signed-links";

const SECRET = "s".repeat(32);
const input = { subject: "booking-1", action: "accept", expiresAt: 2_000 };

describe("signed action links", () => {
  it("verifies its own signatures until they expire", () => {
    const sig = signAction(SECRET, input);
    expect(verifyAction(SECRET, input, sig, 1_000)).toBe(true);
    expect(verifyAction(SECRET, input, sig, 2_001)).toBe(false);
  });

  it("binds subject, action, expiry and secret", () => {
    const sig = signAction(SECRET, input);
    expect(verifyAction(SECRET, { ...input, action: "reject" }, sig, 1_000)).toBe(false);
    expect(verifyAction(SECRET, { ...input, subject: "booking-2" }, sig, 1_000)).toBe(false);
    expect(verifyAction(SECRET, { ...input, expiresAt: 3_000 }, sig, 1_000)).toBe(false);
    expect(verifyAction("t".repeat(32), input, sig, 1_000)).toBe(false);
    expect(verifyAction(SECRET, input, null, 1_000)).toBe(false);
    expect(verifyAction(SECRET, input, "x", 1_000)).toBe(false);
  });
});
