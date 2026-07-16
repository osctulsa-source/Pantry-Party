import type { PantryItem } from '@breadbox/core';

import { buildExpiringSnapshot, expiringLabel, EXPIRING_WIDGET_MAX_ITEMS } from './expiringSnapshot';

// Fixed reference instant; fixtures are NOW ± whole days at the same
// wall-clock time so day math is timezone-stable (see expiryFormat.test.ts).
const NOW = new Date('2026-07-06T12:00:00.000Z');
const DAY_MS = 86_400_000;

let seq = 0;
function item(name: string, expiresInDays: number | null): PantryItem {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${hex}`,
    householdId: '00000000-0000-4000-8000-000000000001',
    name,
    quantity: 1,
    location: 'pantry',
    addedAt: NOW.toISOString(),
    expiresAt:
      expiresInDays === null
        ? undefined
        : new Date(NOW.getTime() + expiresInDays * DAY_MS).toISOString(),
    source: 'manual',
    addedBy: 'tester',
    updatedAt: 0,
    deleted: false,
  };
}

describe('expiringLabel', () => {
  it('describes the expiry window in short relative phrases', () => {
    expect(expiringLabel(item('a', -2), NOW)).toBe('expired');
    expect(expiringLabel(item('b', 0), NOW)).toBe('today');
    expect(expiringLabel(item('c', 1), NOW)).toBe('tomorrow');
    expect(expiringLabel(item('d', 3), NOW)).toBe('in 3 days');
    expect(expiringLabel(item('e', null), NOW)).toBe('');
  });
});

describe('buildExpiringSnapshot', () => {
  it('returns an empty snapshot when nothing is expiring', () => {
    const snapshot = buildExpiringSnapshot([item('Rice', null), item('Beans', 30)], NOW);
    expect(snapshot).toEqual({ count: 0, soonestName: null, soonestLabel: null, items: [] });
  });

  it('counts warning + expired items and surfaces the most urgent first', () => {
    const snapshot = buildExpiringSnapshot(
      [item('Milk', 2), item('Spinach', -1), item('Rice', null), item('Yogurt', 1)],
      NOW,
    );
    expect(snapshot.count).toBe(3);
    expect(snapshot.soonestName).toBe('Spinach');
    expect(snapshot.soonestLabel).toBe('expired');
    expect(snapshot.items.map((i) => i.name)).toEqual(['Spinach', 'Yogurt', 'Milk']);
    expect(snapshot.items[0].expired).toBe(true);
    expect(snapshot.items[1]).toEqual({ name: 'Yogurt', label: 'tomorrow', expired: false });
  });

  it('caps the item list for the medium layout but keeps the full count', () => {
    const many = [0, 1, 2, 3].map((d) => item(`Item ${d}`, d));
    const snapshot = buildExpiringSnapshot(many, NOW);
    expect(snapshot.count).toBe(4);
    expect(snapshot.items).toHaveLength(EXPIRING_WIDGET_MAX_ITEMS);
  });
});
