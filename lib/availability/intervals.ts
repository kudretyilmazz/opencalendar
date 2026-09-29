import type { Interval, IntervalSet } from "./types";

/** Sorts, drops empty intervals and merges overlapping or adjacent ones. Never mutates input. */
export function normalize(input: Iterable<Interval>): IntervalSet {
  const sorted = [...input].filter((x) => x.end > x.start).toSorted((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out.at(-1);
    if (last && x.start <= last.end) out[out.length - 1] = { start: last.start, end: Math.max(last.end, x.end) };
    else out.push({ start: x.start, end: x.end });
  }
  return out;
}

export function union(a: IntervalSet, b: IntervalSet): IntervalSet {
  return normalize([...a, ...b]);
}

export function intersect(a: IntervalSet, b: IntervalSet): IntervalSet {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (start < end) out.push({ start, end });
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return normalize(out);
}

/** a minus b. */
export function subtract(a: IntervalSet, b: IntervalSet): IntervalSet {
  const out: Interval[] = [];
  let j = 0;
  for (const x of a) {
    let cursor = x.start;
    while (j < b.length && b[j].end <= cursor) j++;
    let k = j;
    while (k < b.length && b[k].start < x.end) {
      if (b[k].start > cursor) out.push({ start: cursor, end: b[k].start });
      cursor = Math.max(cursor, b[k].end);
      k++;
    }
    if (cursor < x.end) out.push({ start: cursor, end: x.end });
  }
  return normalize(out);
}

export function clamp(a: IntervalSet, window: Interval): IntervalSet {
  return intersect(a, [window]);
}

/** True if `x` lies entirely within one interval of the set. */
export function contains(set: IntervalSet, x: Interval): boolean {
  return set.some((s) => s.start <= x.start && x.end <= s.end);
}

export function overlaps(set: readonly Interval[], x: Interval): boolean {
  return set.some((s) => s.start < x.end && x.start < s.end);
}

/**
 * Overlap queries in O(log n) (plus the overlapping run) for sorted slot scans: intervals are
 * sorted by start with a prefix maximum of ends, so a query can stop as soon as no earlier
 * interval can reach it. Items may overlap each other (bookings with buffers, calendar events).
 */
export class IntervalIndex<T extends Interval> {
  private readonly items: readonly T[];
  private readonly maxEnd: readonly number[];

  constructor(items: Iterable<T>) {
    this.items = [...items].filter((x) => x.end > x.start).toSorted((a, b) => a.start - b.start);
    let running = Number.NEGATIVE_INFINITY;
    this.maxEnd = this.items.map((x) => (running = Math.max(running, x.end)));
  }

  /** Some item overlapping [q.start, q.end), or undefined. */
  firstOverlap(q: Interval): T | undefined {
    return this.findOverlap(q, () => true);
  }

  /** Some item overlapping q that `accept` agrees to, or undefined (skips e.g. open seats). */
  findOverlap(q: Interval, accept: (item: T) => boolean): T | undefined {
    let lo = 0;
    let hi = this.items.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].start < q.end) {
        last = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    for (let i = last; i >= 0 && this.maxEnd[i] > q.start; i--) {
      if (this.items[i].end > q.start && accept(this.items[i])) return this.items[i];
    }
    return undefined;
  }

  /** True if one item fully contains q (for normalized sets such as working hours). */
  covers(q: Interval): boolean {
    if (q.end <= q.start) return false;
    const hit = this.firstOverlap(q);
    return hit !== undefined && hit.start <= q.start && q.end <= hit.end;
  }
}
