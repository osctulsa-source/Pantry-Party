import { describe, expect, it } from 'vitest';
import {
  computeScheduleIntents,
  MAX_SCHEDULE_INTENTS,
  NOTIFY_LOCAL_HOUR,
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

const item = (
  id: string,
  name: string,
  expiresAt?: string,
): { id: string; name: string; expiresAt?: string } => ({ id, name, expiresAt });

describe('computeScheduleIntents', () => {
  it('returns an empty array for empty input', () => {
    expect(computeScheduleIntents([], NOW)).toEqual([]);
  });

  it('skips items with no expiresAt', () => {
    expect(computeScheduleIntents([item('a', 'Salt')], NOW)).toEqual([]);
  });

  it('skips items with unparseable expiresAt', () => {
    expect(
      computeScheduleIntents([item('a', 'Mystery', 'not a date')], NOW),
    ).toEqual([]);
    expect(computeScheduleIntents([item('a', 'Mystery', '')], NOW)).toEqual([]);
  });

  it('skips items already expired', () => {
    expect(
      computeScheduleIntents([item('a', 'Old Milk', daysFromNow(-1))], NOW),
    ).toEqual([]);
    expect(
      computeScheduleIntents([item('a', 'Old Milk', daysFromNow(-30))], NOW),
    ).toEqual([]);
  });

  it('skips items expiring exactly at now (boundary)', () => {
    expect(
      computeScheduleIntents([item('a', 'On The Edge', NOW.toISOString())], NOW),
    ).toEqual([]);
  });

  it('schedules a far-future item at 09:00 LOCAL on the warning-start day', () => {
    const intents = computeScheduleIntents(
      [item('a', 'Parsley', daysFromNow(30))],
      NOW,
    );
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    expect(intent.itemId).toBe('a');
    expect(intent.itemName).toBe('Parsley');
    // expiry = NOW + 30 days; warningStart (default 3 days) = NOW + 27 days,
    // pinned to 09:00 in the runtime's local timezone.
    const expiryMs = NOW.getTime() + 30 * MS_PER_DAY;
    const expectedTrigger = localPin(expiryMs - 3 * MS_PER_DAY);
    expect(intent.triggerDate.getTime()).toBe(expectedTrigger.getTime());
    expect(intent.triggerDate.getHours()).toBe(NOTIFY_LOCAL_HOUR);
    expect(intent.daysUntilExpiry).toBe(expectedDays(expiryMs, expectedTrigger));
  });

  it('schedules an already-in-warning-zone item at now + 5 minutes', () => {
    const intents = computeScheduleIntents(
      [item('a', 'Yogurt', daysFromNow(2))],
      NOW,
    );
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    // trigger = now + 5min = 2026-06-02T12:05:00.000Z
    expect(intent.triggerDate.toISOString()).toBe('2026-06-02T12:05:00.000Z');
    // expiry - trigger ≈ 2 days - 5min ≈ 1.9965 → round = 2
    expect(intent.daysUntilExpiry).toBe(2);
  });

  it('falls back to now + 5 minutes when the 09:00 local pin has already passed', () => {
    // Build the scenario in the local frame: "now" is 12:00 local today, and the
    // warning zone starts at 16:00 local today. The 09:00 pin on that day is in
    // the past relative to now — the reconciler must never schedule in the past.
    const nowLocal = new Date(2026, 5, 2, 12, 0, 0, 0); // Jun 2 2026, 12:00 local
    const warningStart = new Date(2026, 5, 2, 16, 0, 0, 0); // +4h, same local day
    const expiresAt = new Date(warningStart.getTime() + 3 * MS_PER_DAY); // default warningDays

    const intents = computeScheduleIntents(
      [item('a', 'Tonight Milk', expiresAt.toISOString())],
      nowLocal,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]!.triggerDate.getTime()).toBe(
      nowLocal.getTime() + 5 * 60 * 1000,
    );
  });

  it('honors a custom warningDays threshold', () => {
    // 5 days out, warningDays=7 → warningStart 2 days in the past → now + 5min
    const inWindow = computeScheduleIntents(
      [item('a', 'Bread', daysFromNow(5))],
      NOW,
      7,
    );
    expect(inWindow).toHaveLength(1);
    expect(inWindow[0]!.triggerDate.toISOString()).toBe(
      '2026-06-02T12:05:00.000Z',
    );

    // 10 days out, warningDays=7 → warningStart 3 days out → 09:00 local pin
    const expiryMs = NOW.getTime() + 10 * MS_PER_DAY;
    const future = computeScheduleIntents(
      [item('a', 'Bread', daysFromNow(10))],
      NOW,
      7,
    );
    expect(future).toHaveLength(1);
    expect(future[0]!.triggerDate.getTime()).toBe(
      localPin(expiryMs - 7 * MS_PER_DAY).getTime(),
    );
  });

  it('preserves input order across mixed-status items', () => {
    const intents = computeScheduleIntents(
      [
        item('skip-1', 'Salt'), // no expiresAt
        item('future', 'Parsley', daysFromNow(30)),
        item('skip-2', 'Old Milk', daysFromNow(-2)),
        item('warn', 'Yogurt', daysFromNow(2)),
        item('skip-3', 'Mystery', 'garbage'),
      ],
      NOW,
    );
    expect(intents.map((i) => i.itemId)).toEqual(['future', 'warn']);
  });

  it('is idempotent — same inputs produce deeply-equal output', () => {
    const items = [
      item('a', 'Parsley', daysFromNow(30)),
      item('b', 'Yogurt', daysFromNow(2)),
      item('c', 'Salt'),
    ];
    const a = computeScheduleIntents(items, NOW);
    const b = computeScheduleIntents(items, NOW);
    expect(a).toEqual(b);
  });

  it('clamps daysUntilExpiry to 0 (never negative) at warning-zone trigger', () => {
    // expires in 0.001 days (~86 seconds) — trigger is now + 5min, so the
    // delta is negative; the Math.max(0, ...) clamp must fire.
    const intents = computeScheduleIntents(
      [
        {
          id: 'a',
          name: 'About to go',
          expiresAt: new Date(NOW.getTime() + 86).toISOString(),
        },
      ],
      NOW,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0]!.daysUntilExpiry).toBe(0);
  });

  it('caps output at maxIntents, keeping the soonest triggers in input order', () => {
    // Five items with staggered future expiries → staggered 09:00-local pins.
    // ids by expiry: a(+10d) c(+20d) d(+15d) b(+30d) e(+25d)
    // trigger order (soonest first): a(+7d) d(+12d) c(+17d) e(+22d) b(+27d)
    const items = [
      item('a', 'A', daysFromNow(10)),
      item('b', 'B', daysFromNow(30)),
      item('c', 'C', daysFromNow(20)),
      item('d', 'D', daysFromNow(15)),
      item('e', 'E', daysFromNow(25)),
    ];
    const intents = computeScheduleIntents(items, NOW, undefined, 3);
    // Soonest three are a, d, c — surviving intents keep INPUT order: a, c, d.
    expect(intents.map((i) => i.itemId)).toEqual(['a', 'c', 'd']);
  });

  it('defaults the cap to the iOS 64-pending-notification budget', () => {
    const many = Array.from({ length: MAX_SCHEDULE_INTENTS + 11 }, (_, i) =>
      item(`id-${i}`, `Item ${i}`, daysFromNow(10 + i)),
    );
    const intents = computeScheduleIntents(many, NOW);
    expect(intents).toHaveLength(MAX_SCHEDULE_INTENTS);
    // The dropped intents must be the 11 farthest-out triggers.
    const kept = new Set(intents.map((i) => i.itemId));
    for (let i = 0; i < MAX_SCHEDULE_INTENTS; i++) {
      expect(kept.has(`id-${i}`)).toBe(true);
    }
    for (let i = MAX_SCHEDULE_INTENTS; i < MAX_SCHEDULE_INTENTS + 11; i++) {
      expect(kept.has(`id-${i}`)).toBe(false);
    }
  });
});
