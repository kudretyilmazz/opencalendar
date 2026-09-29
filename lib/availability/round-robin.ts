/**
 * Round-robin host selection (TEAM-005/006). Among the pool hosts free for the slot, pick:
 *
 * 1. the lowest weighted load — recent bookings ÷ weight — so bookings end up proportional to
 *    the weights over time;
 * 2. then the highest priority (the tiebreaker);
 * 3. then the fewest recent bookings;
 * 4. then the user id, so the choice is deterministic.
 *
 * The reason is a short sentence stored on the booking ("why did Alice get this?").
 */

export const PRIORITY_LABELS = ["lowest", "low", "medium", "high", "highest"] as const;

export interface RoundRobinCandidate {
  readonly userId: string;
  readonly name: string;
  /** 1…1000, default 100. */
  readonly weight: number;
  /** 0 lowest … 4 highest. */
  readonly priority: number;
  /** Active bookings of this event type in the recent window. */
  readonly recentBookings: number;
}

export interface RoundRobinChoice {
  readonly userId: string;
  readonly reason: string;
}

const load = (c: RoundRobinCandidate) => c.recentBookings / Math.max(1, c.weight);

function compare(a: RoundRobinCandidate, b: RoundRobinCandidate): number {
  return load(a) - load(b) || b.priority - a.priority || a.recentBookings - b.recentBookings || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
}

function explain(chosen: RoundRobinCandidate, runnerUp: RoundRobinCandidate | undefined, windowDays: number): string {
  const count = `${chosen.recentBookings} booking${chosen.recentBookings === 1 ? "" : "s"} in the last ${windowDays} days`;
  if (!runnerUp) return `Only available host (${count}).`;
  if (load(chosen) < load(runnerUp)) {
    return `Lowest weighted load: ${count} at weight ${chosen.weight}, vs ${runnerUp.name} with ${runnerUp.recentBookings} at weight ${runnerUp.weight}.`;
  }
  if (chosen.priority > runnerUp.priority) {
    return `Tied on load with ${runnerUp.name}; higher priority (${PRIORITY_LABELS[chosen.priority]} vs ${PRIORITY_LABELS[runnerUp.priority]}).`;
  }
  if (chosen.recentBookings < runnerUp.recentBookings) return `Tied on load and priority with ${runnerUp.name}; fewer bookings (${count}).`;
  return `Tied with ${runnerUp.name} on load, priority and bookings; picked in a fixed order.`;
}

export function selectRoundRobinHost(candidates: readonly RoundRobinCandidate[], windowDays: number): RoundRobinChoice | null {
  if (!candidates.length) return null;
  const [chosen, runnerUp] = candidates.toSorted(compare);
  return { userId: chosen.userId, reason: explain(chosen, runnerUp, windowDays) };
}
