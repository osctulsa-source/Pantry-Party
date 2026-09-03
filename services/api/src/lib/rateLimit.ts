/**
 * Dependency-free fixed-window rate limiter. It is in-memory and per-process;
 * replace it with a shared store if the Railway service scales horizontally or
 * the risk profile requires a global limit.
 *
 * Deliberately NOT express-rate-limit: new npm dependencies require a local
 * lockfile regen (CI runs `npm ci`), and ~40 lines covers the need.
 */

export interface RateLimiterOptions {
  /** Max allowed calls per key per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

interface Bucket {
  windowStart: number;
  count: number;
}

/** Sweep threshold — when the key map grows past this, expired buckets are pruned. */
const SWEEP_AT = 10_000;

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly opts: RateLimiterOptions) {}

  check(key: string): RateLimitDecision {
    const now = (this.opts.now ?? Date.now)();

    if (this.buckets.size > SWEEP_AT) {
      for (const [k, b] of this.buckets) {
        if (now - b.windowStart >= this.opts.windowMs) this.buckets.delete(k);
      }
    }

    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.opts.windowMs) {
      this.buckets.set(key, { windowStart: now, count: 1 });
      return { allowed: true, remaining: this.opts.limit - 1 };
    }

    if (bucket.count < this.opts.limit) {
      bucket.count += 1;
      return { allowed: true, remaining: this.opts.limit - bucket.count };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.windowStart + this.opts.windowMs - now) / 1000),
      ),
    };
  }
}
