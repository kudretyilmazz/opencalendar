import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clamp, contains, IntervalIndex, intersect, normalize, overlaps, subtract, union } from "./intervals";
import type { Interval, IntervalSet } from "./types";

const iv = (start: number, end: number): Interval => ({ start, end });

const arbInterval = fc
  .tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 200 }))
  .map(([start, len]) => iv(start, start + len));
const arbSet = fc.array(arbInterval, { maxLength: 12 }).map(normalize);

const isNormalized = (s: IntervalSet) =>
  s.every((x, i) => x.start < x.end && (i === 0 || s[i - 1].end < x.start));

/** Membership test over integer points, used as an oracle. */
const has = (s: IntervalSet, p: number) => s.some((x) => x.start <= p && p < x.end);
const POINTS = Array.from({ length: 1250 }, (_, i) => i);

describe("normalize", () => {
  it("sorts, merges overlapping and adjacent intervals, drops empty ones", () => {
    expect(normalize([iv(5, 7), iv(1, 3), iv(3, 4), iv(6, 9), iv(10, 10)])).toEqual([iv(1, 4), iv(5, 9)]);
  });

  it("does not mutate its input", () => {
    const input = [iv(5, 7), iv(1, 3)];
    normalize(input);
    expect(input).toEqual([iv(5, 7), iv(1, 3)]);
  });
});

describe("set operations", () => {
  it("union / intersect / subtract examples", () => {
    const a = [iv(0, 10), iv(20, 30)];
    const b = [iv(5, 25)];
    expect(union(a, b)).toEqual([iv(0, 30)]);
    expect(intersect(a, b)).toEqual([iv(5, 10), iv(20, 25)]);
    expect(subtract(a, b)).toEqual([iv(0, 5), iv(25, 30)]);
    expect(clamp(a, iv(8, 22))).toEqual([iv(8, 10), iv(20, 22)]);
  });

  it("contains and overlaps respect half-open bounds", () => {
    expect(contains([iv(0, 10)], iv(0, 10))).toBe(true);
    expect(contains([iv(0, 5), iv(5, 10)].slice(0, 1), iv(0, 10))).toBe(false);
    expect(overlaps([iv(0, 10)], iv(10, 20))).toBe(false);
    expect(overlaps([iv(0, 10)], iv(9, 20))).toBe(true);
  });

  it("laws hold for arbitrary sets (NFR-005)", () => {
    fc.assert(
      fc.property(arbSet, arbSet, (a, b) => {
        const u = union(a, b);
        const n = intersect(a, b);
        const d = subtract(a, b);
        expect(isNormalized(u) && isNormalized(n) && isNormalized(d)).toBe(true);
        for (const p of POINTS) {
          expect(has(u, p)).toBe(has(a, p) || has(b, p));
          expect(has(n, p)).toBe(has(a, p) && has(b, p));
          expect(has(d, p)).toBe(has(a, p) && !has(b, p));
        }
        expect(union(a, b)).toEqual(union(b, a));
        expect(subtract(a, a)).toEqual([]);
        expect(intersect(a, union(a, b))).toEqual(a);
      }),
      { numRuns: 200 },
    );
  });
});

describe("IntervalIndex", () => {
  const arbRaw = fc.array(arbInterval, { maxLength: 30 });

  it("agrees with a naive scan for overlap and containment (NFR-001 optimization)", () => {
    fc.assert(
      fc.property(arbRaw, arbInterval, (items, q) => {
        const index = new IntervalIndex(items);
        const naive = items.filter((x) => x.end > x.start && x.start < q.end && q.start < x.end);
        const hit = index.firstOverlap(q);
        expect(hit === undefined).toBe(naive.length === 0);
        if (hit) expect(hit.start < q.end && q.start < hit.end).toBe(true);
        const norm = normalize(items);
        expect(new IntervalIndex(norm).covers(q)).toBe(q.end > q.start && contains(norm, q));
      }),
      { numRuns: 500 },
    );
  });
});
