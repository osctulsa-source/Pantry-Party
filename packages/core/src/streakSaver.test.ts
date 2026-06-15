import { describe, it, expect } from 'vitest';

import { computeStreakSaverIntent, streakSaverBody } from './streakSaver.ts';

// Anchor at noon June 15, 2026 — same as streakStats tests.
const NOW = new Date('2026-06-15T12:00:00');
const WARNING_DAYS = 3; // default

function item(id: string, name: string, expiresAt?: string) {
  return { id, name, expiresAt };
}

describe('computeStreakSaverIntent', () => {
  it('returns null when streak < 3', () => {
    const items = [item('a', 'Milk', '2026-06-16T00:00:00')]; // expires tomorrow, in warning zone
    expect(computeStreakSaverIntent(2, items, NOW, WARNING_DAYS)).toBeNull();
    expect(computeStreakSaverIntent(0, items, NOW, WARNING_DAYS)).toBeNull();
  });

  it('returns null when no items are in the warning zone', () => {
    // Expires June 25 — warning zone starts June 22, well after NOW (June 15)
    const items = [item('a', 'Rice', '2026-06-25T00:00:00')];
    expect(computeStreakSaverIntent(5, items, NOW, WARNING_DAYS)).toBeNull();
  });

  it('returns null when all warning-zone items are already expired', () => {
    const items = [item('a', 'Yogurt', '2026-06-14T00:00:00')]; // expired yesterday
    expect(computeStreakSaverIntent(5, items, NOW, WARNING_DAYS)).toBeNull();
  });

  it('returns null when items have no expiry', () => {
    const items = [item('a', 'Salt')];
    expect(computeStreakSaverIntent(10, items, NOW, WARNING_DAYS)).toBeNull();
  });

  it('returns an intent for a streak ≥3 with a warning-zone item', () => {
    // Expires June 17 → warning starts June 14 → NOW (June 15) is inside
    const items = [item('a', 'Chicken', '2026-06-17T00:00:00')];
    const intent = computeStreakSaverIntent(7, items, NOW, WARNING_DAYS);
    expect(intent).not.toBeNull();
    expect(intent!.itemName).toBe('Chicken');
    expect(intent!.streakDays).toBe(7);
    expect(intent!.id).toBe('streak-saver-a');
  });

  it('picks the soonest-expiring warning-zone item', () => {
    const items = [
      item('a', 'Butter', '2026-06-18T00:00:00'), // expires in 3 days
      item('b', 'Chicken', '2026-06-16T00:00:00'), // expires tomorrow — more urgent
    ];
    const intent = computeStreakSaverIntent(5, items, NOW, WARNING_DAYS);
    expect(intent!.itemName).toBe('Chicken');
    expect(intent!.id).toBe('streak-saver-b');
  });
});

describe('streakSaverBody', () => {
  it('formats "today" when daysUntilExpiry is 0', () => {
    const body = streakSaverBody({ id: 'x', itemName: 'Milk', streakDays: 5, triggerDate: new Date(), daysUntilExpiry: 0 });
    expect(body).toBe('Your 5-day streak is on the line — use or freeze your Milk today.');
  });

  it('formats "before tomorrow" when daysUntilExpiry is 1', () => {
    const body = streakSaverBody({ id: 'x', itemName: 'Chicken', streakDays: 12, triggerDate: new Date(), daysUntilExpiry: 1 });
    expect(body).toBe('Your 12-day streak is on the line — use or freeze your Chicken before tomorrow.');
  });

  it('formats "in the next N days" otherwise', () => {
    const body = streakSaverBody({ id: 'x', itemName: 'Butter', streakDays: 3, triggerDate: new Date(), daysUntilExpiry: 3 });
    expect(body).toBe('Your 3-day streak is on the line — use or freeze your Butter in the next 3 days.');
  });
});
