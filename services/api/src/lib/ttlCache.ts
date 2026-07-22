/**
 * Dependency-free TTL cache with LRU-flavored eviction. In-memory and
 * per-process; appropriate while the API runs as a small Railway service.
 *
 * Purpose here: recipe-search responses are cached 24h so repeat searches
 * (same pantry, same meal tab) stop spending Spoonacular quota — the free
 * tier is 50 points/day and a single browsing session could burn it.
 */

export interface TtlCacheOptions {
  /** Entry lifetime in milliseconds. */
  ttlMs: number;
  /** Hard cap on stored entries; the least-recently-used entry is evicted. */
  maxEntries: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface Entry<T> {
  at: number;
  value: T;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly opts: TtlCacheOptions) {}

  get(key: string): T | undefined {
    const now = (this.opts.now ?? Date.now)();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.at >= this.opts.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency: Map preserves insertion order, so re-inserting makes
    // this entry the newest — the first key is always the LRU candidate.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const now = (this.opts.now ?? Date.now)();
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { at: now, value });
    if (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
