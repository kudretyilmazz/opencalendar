/**
 * Pure auth policies: who may sign up (AUTH-005) and when an account is locked (AUTH-004).
 * Kept free of I/O so they can be unit-tested exhaustively.
 */

export type SignupMode = "open" | "invite_only" | "disabled";
export type UserRole = "user" | "admin";

export type SignupDecision =
  | { allowed: true; role: UserRole }
  | { allowed: false; reason: "SIGNUP_DISABLED" | "INVITE_REQUIRED" };

/** `invited`: the address has a pending, unexpired team invitation (TEAM-002). */
export function decideSignup(input: { mode: SignupMode; existingUserCount: number; invited?: boolean }): SignupDecision {
  // First-run bootstrap: the very first account becomes the instance admin regardless of mode.
  if (input.existingUserCount === 0) return { allowed: true, role: "admin" };
  switch (input.mode) {
    case "open":
      return { allowed: true, role: "user" };
    case "disabled":
      return { allowed: false, reason: "SIGNUP_DISABLED" };
    case "invite_only":
      // Only people a team invited (they still have to verify the address to join the team).
      return input.invited ? { allowed: true, role: "user" } : { allowed: false, reason: "INVITE_REQUIRED" };
  }
}

export const LOCKOUT_MAX_FAILURES = 10;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type LockoutState = { locked: false } | { locked: true; until: Date };

/**
 * An account is locked when it has LOCKOUT_MAX_FAILURES failed sign-ins inside the sliding
 * window. The lock lifts as soon as enough failures age out of the window.
 */
export function evaluateLockout(failures: readonly Date[], now: Date): LockoutState {
  const windowStart = now.getTime() - LOCKOUT_WINDOW_MS;
  const recent = failures
    .map((d) => d.getTime())
    .filter((t) => t > windowStart && t <= now.getTime())
    .toSorted((a, b) => b - a);
  if (recent.length < LOCKOUT_MAX_FAILURES) return { locked: false };
  const oldestCounted = recent[LOCKOUT_MAX_FAILURES - 1];
  return { locked: true, until: new Date(oldestCounted + LOCKOUT_WINDOW_MS) };
}
