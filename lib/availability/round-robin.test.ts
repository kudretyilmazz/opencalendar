import { describe, expect, it } from "vitest";
import { type RoundRobinCandidate, selectRoundRobinHost } from "./round-robin";

const c = (userId: string, patch: Partial<RoundRobinCandidate> = {}): RoundRobinCandidate => ({
  userId,
  name: userId.toUpperCase(),
  weight: 100,
  priority: 2,
  recentBookings: 0,
  ...patch,
});

describe("selectRoundRobinHost (TEAM-005/006)", () => {
  it("picks the lowest weighted load and says why", () => {
    const choice = selectRoundRobinHost([c("a", { recentBookings: 4 }), c("b", { recentBookings: 3 })], 30);
    expect(choice?.userId).toBe("b");
    expect(choice?.reason).toMatch(/Lowest weighted load: 3 bookings in the last 30 days at weight 100, vs A with 4/);
  });

  it("weights scale the load", () => {
    // a: 4/200 = 0.02, b: 3/100 = 0.03
    expect(selectRoundRobinHost([c("a", { recentBookings: 4, weight: 200 }), c("b", { recentBookings: 3 })], 30)?.userId).toBe("a");
  });

  it("priority breaks ties, then fewer bookings, then a fixed order", () => {
    const tiedPriority = selectRoundRobinHost([c("a"), c("b", { priority: 4 })], 30);
    expect(tiedPriority).toMatchObject({ userId: "b", reason: expect.stringMatching(/higher priority \(highest vs medium\)/) });
    // Same load (2/200 = 1/100), same priority: fewer bookings wins.
    expect(selectRoundRobinHost([c("a", { recentBookings: 2, weight: 200 }), c("b", { recentBookings: 1 })], 30)).toMatchObject({
      userId: "b",
      reason: expect.stringMatching(/fewer bookings/),
    });
    expect(selectRoundRobinHost([c("b"), c("a")], 30)).toMatchObject({ userId: "a", reason: expect.stringMatching(/fixed order/) });
    expect(selectRoundRobinHost([c("a", { recentBookings: 1 })], 7)?.reason).toBe("Only available host (1 booking in the last 7 days).");
    expect(selectRoundRobinHost([], 30)).toBeNull();
  });

  /** Roadmap exit criterion: distribution with weights stays within tolerance over 1,000 bookings. */
  function simulate(weights: Record<string, number>, bookings: number, available: (id: string, i: number) => boolean) {
    const counts: Record<string, number> = Object.fromEntries(Object.keys(weights).map((id) => [id, 0]));
    for (let i = 0; i < bookings; i++) {
      const free = Object.keys(weights).filter((id) => available(id, i));
      const choice = selectRoundRobinHost(
        free.map((id) => c(id, { weight: weights[id], recentBookings: counts[id] })),
        30,
      );
      if (choice) counts[choice.userId] += 1;
    }
    return counts;
  }

  it("distributes 1,000 bookings in proportion to the weights (always available)", () => {
    const counts = simulate({ a: 100, b: 200, c: 300, d: 400 }, 1000, () => true);
    expect(counts.a).toBeGreaterThanOrEqual(99);
    expect(counts.a).toBeLessThanOrEqual(101);
    expect(counts.b).toBeGreaterThanOrEqual(199);
    expect(counts.c).toBeGreaterThanOrEqual(299);
    expect(counts.d).toBeGreaterThanOrEqual(399);
    expect(counts.a + counts.b + counts.c + counts.d).toBe(1000);
  });

  it("stays within 3 percentage points of the weights when hosts are often busy", () => {
    // Deterministic pseudo-random availability: each host is free ~70% of the time.
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const table = Array.from({ length: 1000 }, () => ({ a: rand() < 0.7, b: rand() < 0.7, c: rand() < 0.7 }));
    const counts = simulate({ a: 100, b: 100, c: 200 }, 1000, (id, i) => table[i][id as "a" | "b" | "c"]);
    const total = counts.a + counts.b + counts.c;
    expect(total).toBeGreaterThan(950); // someone is free almost always
    expect(Math.abs(counts.a / total - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(counts.b / total - 0.25)).toBeLessThan(0.03);
    expect(Math.abs(counts.c / total - 0.5)).toBeLessThan(0.03);
  });
});
