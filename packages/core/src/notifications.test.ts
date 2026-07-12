import { describe, expect, it } from 'vitest';
import {
  computeDigestIntents,
  MAX_SCHEDULE_INTENTS,
  NOTIFY_LOCAL_HOUR,
  type DigestTier,
} from './notifications.ts';

const NOW = new Date('2026-06-02T12:00:00Z');
const MS_PER_DAY = 86_400_000;
const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * MS_PER_DAY).toISOString();

/**
 * Mirror of the reconciler's local-time pin: 09:00 local on the warning-start
 * day. Tests construct expectations through the same local-frame calls so they
 * are host-timezone-agnostic (CI runs UTC; dev machines usually don't).
 */
const localPin = (ms: number) => {
  const t = new Date(ms);
  t.setHours(NOTIFY_LOCAL_HOUR, 0, 0, 0);
  return t;
};

const expectedDays = (expiryMs: number, trigger: Date) =>
  Math.max(0, Math.round((expiryMs - trigger.getTime()) / MS_PER_DAY));

const tierFrom = (days: number): DigestTier =>
  days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'soon';

const item = (
  id: string,
  name: string,
  expiresAt?: string,
): { id: string; name: string; expiresAt?: string } => ({ id, name, expiresAt });

describe('computeDigestIntents', () => {
  it('returns an empty array for empty input', () => {
    expect(computeDigestIntents([], NOW)).toEqual([]);
  });

  it('skips items with no expiresAt', () => {
    expect(computeDigestIntents([item('a', 'Salt')], NOW)).toEqual([]);
  });

  it('skips items with unparseable expiresAt', () => {
    expect(computeDigestIntents([item('a', 'Mystery', 'not a date')], NOW)).toEqual([]);
    expect(computeDigestIntents([item('a', 'Mystery', '')], NOW)).toEqual([]);
  });

  it('skips items already expired', () => {
    expect(computeDigestIntents([item('a', 'Old Milk', daysFromNow(-1))], NOW)).toEqual([]);
    expect(computeDigestIntents([item('a', 'Old Milk', daysFromNow(-30))], NOW)).toEqual([]);
  });

  it('skips items expiring exactly at now (boundary)', () => {
    expect(computeDigestIntents([item('a', 'On The Edge', NOW.toISOString())], NOW)).toEqual([]);
  });

  it('emits one digest for a far-future item, pinned to 09:00 local on warning-start', () => {
    const intents = computeDigestIntents([item('a', 'Parsley', daysFromNow(30))], NOW);
    expect(intents).toHaveLength(1);
    const d = intents[0]!;
    const expiryMs = NOW.getTime() + 30 * MS_PER_DAY;
    const expectedTrigger = localPin(expiryMs - 3 * MS_PER_DAY); // default warningDays = 3
    expect(d.id).toBe(`digest-${expectedTrigger.getFullYear()}-${`${expectedTrigger.getMonth() + 1}`.padStart(2, '0')}-${`${expectedTrigger.getDate()}`.padStart(2, '0')}`);
    expect(d.triggerDate.getTime()).toBe(expectedTrigger.getTime());
    expect(d.triggerDate.getHours()).toBe(NOTIFY_LOCAL_HOUR);
    expect(d.items).toEqual([
      { id: 'a', name: 'Parsley', daysUntilExpiry: expectedDays(expiryMs, expectedTrigger) },
    ]);
    expect(d.minDaysUntilExpiry).toBe(expectedDays(expiryMs, expectedTrigger));
    expect(d.tier).toBe(tierFrom(expectedDays(expiryMs, expectedTrigger)));
  });

  it('BUNDLES multiple items that fire the same morning into ONE digest', () => {
    // Two items expiring the same instant → same warning-start day → one digest.
    const intents = computeDigestIntents(
      [item('a', 'Spinach', daysFromNow(30)), item('b', 'Yogurt', daysFromNow(30))],
      NOW,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]!.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('separates items whose warning-start days differ into distinct digests', () => {
    const intents = computeDigestIntents(
      [item('a', 'Parsley', daysFromNow(30)), item('b', 'Basil', daysFromNow(40))],
      NOW,
    );
    expect(intents).toHaveLength(2);
    // Sorted soonest-first: the +30d item's morning comes before the +40d one.
    expect(intents[0]!.items[0]!.id).toBe('a');
    expect(intents[1]!.items[0]!.id).toBe('b');
  });

  it('orders items within a digest soonest-expiring first (the lead)', () => {
    // Both already in the warning zone → same now+5m trigger, one digest.
    const intents = computeDigestIntents(
      [item('later', 'Cheese', daysFromNow(2.5)), item('sooner', 'Milk', daysFromNow(0.5))],
      NOW,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]!.items[0]!.id).toBe('sooner'); // most urgent leads
    expect(intents[0]!.items[1]!.id).toBe('later');
  });

  it('schedules an already-in-warning-zone digest at now + 5 minutes', () => {
    const intents = computeDigestIntents([item('a', 'Yogurt', daysFromNow(2))], NOW);
    expect(intents).toHaveLength(1);
    expect(intents[0]!.triggerDate.toISOString()).toBe('2026-06-02T12:05:00.000Z');
    expect(intents[0]!.items[0]!.daysUntilExpiry).toBe(2);
    expect(intents[0]!.tier).toBe('soon');
  });

  it('derives the today tier for an item expiring within the day', () => {
    const intents = computeDigestIntents([item('a', 'Milk', daysFromNow(0.5))], NOW);
    expect(intents).toHaveLength(1);
    expect(intents[0]!.minDaysUntilExpiry).toBe(0);
    expect(intents[0]!.tier).toBe('today');
  });

  it('derives the tomorrow tier for an item ~1.5 days out', () => {
    const intents = computeDigestIntents([item('a', 'Bread', daysFromNow(1.5))], NOW);
    expect(intents).toHaveLength(1);
    expect(intents[0]!.minDaysUntilExpiry).toBe(1);
    expect(intents[0]!.tier).toBe('tomorrow');
  });

  it('takes the digest tier from its SOONEST item', () => {
    // Two immediate items: one today (0.5d), one soon (2.5d) → min = today.
    const intents = computeDigestIntents(
      [item('a', 'Berries', daysFromNow(2.5)), item('b', 'Lettuce', daysFromNow(0.5))],
      NOW,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]!.tier).toBe('today');
    expect(intents[0]!.minDaysUntilExpiry).toBe(0);
  });

  it('honors a custom warningDays threshold', () => {
    // 10 days out, warningDays=7 → warningStart 3 days out → 09:00 local pin.
    const expiryMs = NOW.getTime() + 10 * MS_PER_DAY;
    const future = computeDigestIntents([item('a', 'Bread', daysFromNow(10))], NOW, 7);
    expect(future).toHaveLength(1);
    expect(future[0]!.triggerDate.getTime()).toBe(localPin(expiryMs - 7 * MS_PER_DAY).getTime());
  });

  it('is idempotent — same inputs produce deeply-equal output', () => {
    const items = [
      item('a', 'Parsley', daysFromNow(30)),
      item('b', 'Yogurt', daysFromNow(2)),
      item('c', 'Salt'),
    ];
    expect(computeDigestIntents(items, NOW)).toEqual(computeDigestIntents(items, NOW));
  });

  it('clamps daysUntilExpiry to 0 (never negative)', () => {
    const intents = computeDigestIntents(
      [{ id: 'a', name: 'About to go', expiresAt: new Date(NOW.getTime() + 86).toISOString() }],
      NOW,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]!.items[0]!.daysUntilExpiry).toBe(0);
  });

  it('caps output at maxIntents, keeping the soonest-firing digests', () => {
    // Five items on distinct future days → five one-item digests.
    const items = [
      item('a', 'A', daysFromNow(10)),
      item('b', 'B', daysFromNow(30)),
      item('c', 'C', daysFromNow(20)),
      item('d', 'D', daysFromNow(15)),
      item('e', 'E', daysFromNow(25)),
    ];
    const intents = computeDigestIntents(items, NOW, undefined, 3);
    expect(intents).toHaveLength(3);
    // Soonest three triggers → items a(+10), d(+15), c(+20), in trigger order.
    expect(intents.map((d) => d.items[0]!.id)).toEqual(['a', 'd', 'c']);
  });

  it('defaults the cap to the iOS 64-pending-notification budget', () => {
    // Distinct future days so each item is its own digest.
    const many = Array.from({ length: MAX_SCHEDULE_INTENTS + 11 }, (_, i) =>
      item(`id-${i}`, `Item ${i}`, daysFromNow(10 + i)),
    );
    const intents = computeDigestIntents(many, NOW);
    expect(intents).toHaveLength(MAX_SCHEDULE_INTENTS);
    const kept = new Set(intents.flatMap((d) => d.items.map((i) => i.id)));
    for (let i = 0; i < MAX_SCHEDULE_INTENTS; i++) expect(kept.has(`id-${i}`)).toBe(true);
    for (let i = MAX_SCHEDULE_INTENTS; i < MAX_SCHEDULE_INTENTS + 11; i++) {
      expect(kept.has(`id-${i}`)).toBe(false);
    }
  });
});
