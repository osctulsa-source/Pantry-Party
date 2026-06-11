import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rateLimit.js';

function limiterAt(limit: number, windowMs: number) {
  let t = 1_000_000;
  const limiter = new FixedWindowRateLimiter({ limit, windowMs, now: () => t });
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit within a window, then rejects', () => {
    const { limiter } = limiterAt(3, 60_000);
    expect(limiter.check('u1').allowed).toBe(true);
    expect(limiter.check('u1').allowed).toBe(true);
    expect(limiter.check('u1').allowed).toBe(true);
    const fourth = limiter.check('u1');
    expect(fourth.allowed).toBe(false);
    if (!fourth.allowed) expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const { limiter } = limiterAt(1, 60_000);
    expect(limiter.check('u1').allowed).toBe(true);
    expect(limiter.check('u2').allowed).toBe(true);
    expect(limiter.check('u1').allowed).toBe(false);
  });

  it('resets after the window elapses', () => {
    const { limiter, advance } = limiterAt(1, 60_000);
    expect(limiter.check('u1').allowed).toBe(true);
    expect(limiter.check('u1').allowed).toBe(false);
    advance(60_000);
    expect(limiter.check('u1').allowed).toBe(true);
  });

  it('reports a sane Retry-After near the window end', () => {
    const { limiter, advance } = limiterAt(1, 60_000);
    limiter.check('u1');
    advance(59_500);
    const denied = limiter.check('u1');
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.retryAfterSeconds).toBe(1);
  });

  it('counts down remaining within the window', () => {
    const { limiter } = limiterAt(2, 60_000);
    const first = limiter.check('u1');
    const second = limiter.check('u1');
    expect(first).toEqual({ allowed: true, remaining: 1 });
    expect(second).toEqual({ allowed: true, remaining: 0 });
  });
});
