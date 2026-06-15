import { describe, it, expect } from 'vitest';

import { computeInsights, type ExpiryEventInput, type CookEventInput } from './streakStats.ts';

function used(at: string, name = 'item'): ExpiryEventInput {
  return { kind: 'used', itemName: name, at };
}
function tossed(at: string, name = 'item'): ExpiryEventInput {
  return { kind: 'tossed', itemName: name, at };
}
function cook(at: string, title = 'recipe'): CookEventInput {
  return { recipeId: 1, recipeTitle: title, cookedAt: at, itemsUsed: 1 };
}

// Anchor "now" at noon June 15, 2026 so tests are deterministic.
const NOW = new Date('2026-06-15T12:00:00');

describe('computeInsights', () => {
  it('returns zeroes for empty logs', () => {
    const result = computeInsights([], [], NOW);
    expect(result).toEqual({
      streakDays: 0,
      bestStreak: 0,
      totalRescues: 0,
      totalTossed: 0,
      totalCooks: 0,
      estimatedSavings: 0,
    });
  });

  it('counts rescues, tossed, cooks, and savings correctly', () => {
    const expiry = [
      used('2026-06-14T10:00:00'),
      used('2026-06-13T10:00:00'),
      used('2026-06-12T10:00:00'),
      tossed('2026-06-11T10:00:00'),
    ];
    const cooks = [cook('2026-06-14T18:00:00'), cook('2026-06-13T18:00:00')];
    const result = computeInsights(expiry, cooks, NOW);
    expect(result.totalRescues).toBe(3);
    expect(result.totalTossed).toBe(1);
    expect(result.totalCooks).toBe(2);
    // 3 rescues × $2.50 = $7.50 → rounded to $8
    expect(result.estimatedSavings).toBe(8);
  });

  it('computes a streak from today backward, broken by a tossed day', () => {
    // June 15 (today): no events
    // June 14: used (rescue)
    // June 13: used
    // June 12: tossed  ← breaks the streak here
    // June 11: used
    const expiry = [
      used('2026-06-14T10:00:00'),
      used('2026-06-13T10:00:00'),
      tossed('2026-06-12T10:00:00'),
      used('2026-06-11T10:00:00'),
    ];
    const result = computeInsights(expiry, [], NOW);
    // Streak: June 15 (no events, no waste) + June 14 + June 13 = 3 days
    // June 12 had waste → stop
    expect(result.streakDays).toBe(3);
  });

  it('days with no events do NOT break the streak (positive framing)', () => {
    // June 15 (today): nothing
    // June 14: nothing
    // June 13: nothing
    // June 12: used
    // June 11: nothing
    // June 10: used ← earliest
    const expiry = [
      used('2026-06-12T10:00:00'),
      used('2026-06-10T10:00:00'),
    ];
    const result = computeInsights(expiry, [], NOW);
    // Walk back from June 15 through June 10 (earliest) — no tossed anywhere
    // → 6 days (15, 14, 13, 12, 11, 10)
    expect(result.streakDays).toBe(6);
  });

  it('a tossed event today gives a streak of 0', () => {
    const expiry = [tossed('2026-06-15T08:00:00'), used('2026-06-14T10:00:00')];
    const result = computeInsights(expiry, [], NOW);
    expect(result.streakDays).toBe(0);
  });

  it('tracks the best streak as a high-water mark', () => {
    // Days 10-13: clean (4-day run, the best)
    // Day 14: tossed
    // Day 15 (today): clean → current streak = 1
    const expiry = [
      used('2026-06-10T10:00:00'),
      used('2026-06-11T10:00:00'),
      used('2026-06-12T10:00:00'),
      used('2026-06-13T10:00:00'),
      tossed('2026-06-14T10:00:00'),
    ];
    const result = computeInsights(expiry, [], NOW);
    expect(result.streakDays).toBe(1); // only today (June 15)
    expect(result.bestStreak).toBe(4); // June 10-13
  });

  it('cook events contribute to the tracked-days range but not to waste', () => {
    // Only cook events, no expiry events — no waste possible
    const cooks = [cook('2026-06-12T18:00:00'), cook('2026-06-14T18:00:00')];
    const result = computeInsights([], cooks, NOW);
    // Walk from today to June 12 (earliest cook day) — no tossed → 4 days
    expect(result.streakDays).toBe(4);
    expect(result.totalCooks).toBe(2);
  });

  it('handles multiple events on the same day correctly', () => {
    // June 14: two rescues and one toss — the toss counts, day is "tossed"
    const expiry = [
      used('2026-06-14T08:00:00'),
      used('2026-06-14T12:00:00'),
      tossed('2026-06-14T16:00:00'),
      used('2026-06-13T10:00:00'),
    ];
    const result = computeInsights(expiry, [], NOW);
    // June 15: no events → ok, June 14: has tossed → break
    expect(result.streakDays).toBe(1);
    expect(result.totalRescues).toBe(3);
    expect(result.totalTossed).toBe(1);
  });
});
