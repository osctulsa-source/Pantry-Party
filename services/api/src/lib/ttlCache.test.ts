import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttlCache.js';

function cacheAt<T>(ttlMs: number, maxEntries: number) {
  let t = 1_000_000;
  const cache = new TtlCache<T>({ ttlMs, maxEntries, now: () => t });
  return { cache, advance: (ms: number) => (t += ms) };
}

describe('TtlCache', () => {
  it('returns stored values before the TTL and drops them after', () => {
    const { cache, advance } = cacheAt<string>(1_000, 10);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    advance(999);
    expect(cache.get('k')).toBe('v');
    advance(1);
    expect(cache.get('k')).toBeUndefined();
  });

  it('misses on unknown keys', () => {
    const { cache } = cacheAt<string>(1_000, 10);
    expect(cache.get('nope')).toBeUndefined();
  });

  it('evicts the least-recently-used entry past maxEntries', () => {
    const { cache } = cacheAt<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // refresh a — b is now LRU
    cache.set('c', 3); // evicts b
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  it('overwrites an existing key without growing', () => {
    const { cache } = cacheAt<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('expired entries do not block re-set', () => {
    const { cache, advance } = cacheAt<number>(1_000, 2);
    cache.set('a', 1);
    advance(2_000);
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 9);
    expect(cache.get('a')).toBe(9);
  });
});
