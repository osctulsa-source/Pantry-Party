import { describe, expect, it } from 'vitest';
import { computeScheduleIntents } from './notifications.ts';

const NOW = new Date('2026-06-02T12:00:00Z');
const MS_PER_DAY = 86_400_000;
const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * MS_PER_DAY).toISOString();

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

  it('schedules a far-future item at warningStart 09:00 UTC', () => {
    const intents = computeScheduleIntents(
      [item('a', 'Parsley', daysFromNow(30))],
      NOW,
    );
    expect(intents).toHaveLength(1);
    const intent = intents[0]!;
    expect(intent.itemId).toBe('a');
    expect(intent.itemName).toBe('Parsley');
    // expiry = NOW + 30 days = 2026-07-02T12:00:00Z
    // warningStart (default 3 days) = 2026-06-29T12:00:00Z → 09:00 UTC pin
    expect(intent.triggerDate.toISOString()).toBe('2026-06-29T09:00:00.000Z');
    // expiry - trigger = 3 days + 3 hours = 3.125 days → round = 3
    expect(intent.daysUntilExpiry).toBe(3);
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

    // 10 days out, warningDays=7 → warningStart 3 days out → 09:00 UTC pin
    // NOW + 10 = 2026-06-12T12:00:00Z; warningStart = 2026-06-05T12:00:00Z → 09:00 UTC
    const future = computeScheduleIntents(
      [item('a', 'Bread', daysFromNow(10))],
      NOW,
      7,
    );
    expect(future).toHaveLength(1);
    expect(future[0]!.triggerDate.toISOString()).toBe('2026-06-05T09:00:00.000Z');
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
});
