import { describe, expect, it } from "vitest";
import { createCipher } from "@/lib/crypto/encryption";
import { checkOAuthState, sealOAuthState } from "./oauth-state";

const cipher = createCipher({ current: Buffer.alloc(32, 3).toString("base64") });
const state = { state: "s".repeat(22), verifier: "v".repeat(43), provider: "google", userId: "u1", expiresAt: 10_000 };
const expected = { state: state.state, provider: "google", userId: "u1", now: 5_000 };

describe("OAuth state cookie", () => {
  it("accepts the matching state for the same user and provider", () => {
    expect(checkOAuthState(cipher, sealOAuthState(cipher, state), expected)).toEqual({ ok: true, state });
  });

  it.each([
    ["a different state (CSRF)", { state: "x".repeat(22) }],
    ["another provider", { provider: "microsoft" }],
    ["another signed-in user", { userId: "u2" }],
    ["no state parameter", { state: null }],
  ])("rejects %s", (_label, patch) => {
    expect(checkOAuthState(cipher, sealOAuthState(cipher, state), { ...expected, ...patch })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects expired, missing and tampered cookies", () => {
    expect(checkOAuthState(cipher, sealOAuthState(cipher, state), { ...expected, now: 20_000 })).toMatchObject({ reason: "expired" });
    expect(checkOAuthState(cipher, undefined, expected)).toMatchObject({ reason: "missing" });
    const other = createCipher({ current: Buffer.alloc(32, 4).toString("base64") });
    expect(checkOAuthState(cipher, sealOAuthState(other, state), expected)).toMatchObject({ reason: "tampered" });
  });
});
