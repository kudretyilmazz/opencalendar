import { computeSlots } from "./slots";
import type { EventTypeInput, ExcludedSlot, HostInput, Slot, SlotQuery } from "./types";

/**
 * Team availability (TEAM-004/005/007): per-host slots from the single-host engine, combined.
 *
 * - Every **fixed** host must be free (collective = all hosts fixed).
 * - When there is a round-robin **pool**, at least one pool host must also be free; the slot
 *   carries the free pool hosts so the booking step can pick one (TEAM-006).
 *
 * Pure: the same inputs always give the same slots (NFR-005).
 */

export interface TeamHostInput {
  readonly host: HostInput;
  /** Always attends. In a collective event type every host is fixed. */
  readonly fixed: boolean;
}

export interface TeamSlot extends Slot {
  /** Pool hosts free at this slot (round robin only), in input order. */
  readonly poolHostIds?: readonly string[];
}

export interface TeamSlotResult {
  readonly slots: readonly TeamSlot[];
  /** With `explain`: per host, why each of its candidates was excluded. */
  readonly excludedByHost?: ReadonlyMap<string, readonly ExcludedSlot[]>;
}

const key = (s: Slot) => `${s.start}:${s.end}`;

export function computeTeamSlots(event: EventTypeInput, hosts: readonly TeamHostInput[], query: SlotQuery): TeamSlotResult {
  if (!hosts.length) return { slots: [] };
  const fixed = hosts.filter((h) => h.fixed);
  const pool = hosts.filter((h) => !h.fixed);
  const perHost = new Map(hosts.map((h) => [h.host.userId, computeSlots(event, h.host, query)]));
  const freeKeys = (id: string) => new Set(perHost.get(id)!.slots.map(key));

  // Candidates: slots of the first fixed host (they must all agree), else the pool's union.
  const seed = fixed.length ? perHost.get(fixed[0].host.userId)!.slots : pool.flatMap((h) => perHost.get(h.host.userId)!.slots);
  const fixedFree = fixed.slice(1).map((h) => freeKeys(h.host.userId));
  const poolFree = pool.map((h) => ({ id: h.host.userId, free: freeKeys(h.host.userId) }));

  const byKey = new Map<string, TeamSlot>();
  for (const slot of seed) {
    const k = key(slot);
    if (byKey.has(k) || !fixedFree.every((set) => set.has(k))) continue;
    if (!pool.length) {
      byKey.set(k, { start: slot.start, end: slot.end });
      continue;
    }
    const poolHostIds = poolFree.filter((p) => p.free.has(k)).map((p) => p.id);
    if (poolHostIds.length) byKey.set(k, { start: slot.start, end: slot.end, poolHostIds });
  }
  const slots = [...byKey.values()].toSorted((a, b) => a.start - b.start);
  if (!query.explain) return { slots };
  return { slots, excludedByHost: new Map([...perHost].map(([id, r]) => [id, r.excluded ?? []])) };
}

/**
 * Booking-time check for one slot: which hosts can take it. `ok` needs every fixed host free and,
 * with a pool, at least one free pool host (TEAM-005/007).
 */
export function teamSlotAvailability(
  isFree: (hostId: string) => boolean,
  hosts: readonly { userId: string; fixed: boolean }[],
): { ok: true; poolHostIds: string[] } | { ok: false; blockedBy: string } {
  const blockedFixed = hosts.find((h) => h.fixed && !isFree(h.userId));
  if (blockedFixed) return { ok: false, blockedBy: blockedFixed.userId };
  const pool = hosts.filter((h) => !h.fixed);
  const poolHostIds = pool.filter((h) => isFree(h.userId)).map((h) => h.userId);
  if (pool.length && !poolHostIds.length) return { ok: false, blockedBy: "pool" };
  return { ok: true, poolHostIds };
}
