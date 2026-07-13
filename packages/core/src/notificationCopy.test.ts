import { describe, expect, it } from 'vitest';
import { digestNotification } from './notificationCopy.ts';
import type { DigestIntent, DigestItem, DigestTier } from './notifications.ts';

const at = (iso: string) => new Date(iso);

const intentOf = (
  tier: DigestTier,
  items: DigestItem[],
  triggerDate = at('2026-06-10T09:00:00Z'),
): DigestIntent => ({
  id: 'digest-2026-06-10',
  triggerDate,
  items,
  minDaysUntilExpiry: items[0]?.daysUntilExpiry ?? 0,
  tier,
});

const spinach: DigestItem = { id: 'a', name: 'Spinach', daysUntilExpiry: 3 };
const yogurt: DigestItem = { id: 'b', name: 'Yogurt', daysUntilExpiry: 3 };
const milk: DigestItem = { id: 'c', name: 'Milk', daysUntilExpiry: 3 };

describe('digestNotification', () => {
  it('is deterministic — same intent + streak → identical copy', () => {
    const intent = intentOf('soon', [spinach]);
    expect(digestNotification(intent, 0)).toEqual(digestNotification(intent, 0));
    expect(digestNotification(intent, 7)).toEqual(digestNotification(intent, 7));
  });

  it('never leaves an unfilled {token} in the output', () => {
    const cases: DigestIntent[] = [
      intentOf('soon', [spinach]),
      intentOf('soon', [spinach, yogurt, milk]),
      intentOf('tomorrow', [spinach]),
      intentOf('tomorrow', [spinach, yogurt]),
      intentOf('today', [spinach]),
      intentOf('today', [spinach, yogurt, milk]),
    ];
    for (const intent of cases) {
      for (const streak of [0, 5]) {
        const { title, body } = digestNotification(intent, streak);
        expect(title).toBeTruthy();
        expect(body).not.toMatch(/\{[a-z]+\}/);
      }
    }
  });

  it('names the single item in a one-item digest', () => {
    const { body } = digestNotification(intentOf('soon', [spinach]), 0);
    expect(body).toContain('Spinach');
  });

  it('uses the count and lead name for a multi-item digest', () => {
    const { body } = digestNotification(intentOf('soon', [spinach, yogurt, milk]), 0);
    expect(body).toContain('3'); // count
    expect(body).toContain('Spinach'); // lead (items[0])
  });

  it('unlocks streak flavour on urgent tiers when the streak is worth protecting', () => {
    const today = digestNotification(intentOf('today', [spinach]), 7);
    expect(today.body.toLowerCase()).toContain('streak');
    expect(today.body).toContain('7');

    const tomorrow = digestNotification(intentOf('tomorrow', [spinach, yogurt]), 12);
    expect(tomorrow.body.toLowerCase()).toContain('streak');
    expect(tomorrow.body).toContain('12');
  });

  it('does NOT use streak flavour on the calm "soon" tier, even with a big streak', () => {
    const { body } = digestNotification(intentOf('soon', [spinach]), 30);
    expect(body.toLowerCase()).not.toContain('streak');
  });

  it('does NOT use streak flavour below the 3-day threshold', () => {
    const { body } = digestNotification(intentOf('today', [spinach]), 2);
    expect(body.toLowerCase()).not.toContain('streak');
  });

  it('gives each tier its own title voice', () => {
    const today = digestNotification(intentOf('today', [spinach]), 0);
    const tomorrow = digestNotification(intentOf('tomorrow', [spinach]), 0);
    const soon = digestNotification(intentOf('soon', [spinach]), 0);
    // Titles are drawn from disjoint per-tier banks, so no two tiers collide here.
    expect(new Set([today.title, tomorrow.title, soon.title]).size).toBe(3);
  });
});
