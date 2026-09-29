/** Tiny in-process TTL cache with in-flight de-duplication (concurrent misses share one load). */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: Promise<V>; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    if (this.entries.size >= this.maxEntries) this.entries.clear();
    const value = load();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    value.catch(() => this.entries.delete(key)); // never cache failures
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
