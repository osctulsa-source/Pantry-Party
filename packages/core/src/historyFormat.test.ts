import { describe, it, expect } from 'vitest';

import { dayLabel, groupByDay } from './historyFormat.ts';
import type { ActivityEvent } from './activity.ts';

// Local-time ISO strings (no trailing Z) so `now` and events parse in the same
// timezone — keeps Today/Yesterday classification host-tz-agnostic.
function ev(occurredAt: string, label = 'X'): ActivityEvent {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    householdId: '00000000-0000-0000-0000-000000000002',
    kind: 'cooked',
    label,
    occurredAt,
    addedBy: 'user-1',
    updatedAt: 1,
    deleted: false,
  } as ActivityEvent;
}

const now = new Date('2026-06-22T12:00:00');

describe('dayLabel', () => {
  it('labels same-day as Today', () => {
    expect(dayLabel('2026-06-22T08:00:00', now)).toBe('Today');
  });

  it('labels the prior day as Yesterday', () => {
    expect(dayLabel('2026-06-21T23:00:00', now)).toBe('Yesterday');
  });

  it('labels older days with a formatted, non-relative string', () => {
    const label = dayLabel('2026-06-10T08:00:00', now);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns Earlier for an unparseable date', () => {
    expect(dayLabel('not-a-date', now)).toBe('Earlier');
  });
});

describe('groupByDay', () => {
  it('groups contiguous same-day events and splits across days, preserving order', () => {
    const events = [
      ev('2026-06-22T10:00:00', 'a'),
      ev('2026-06-22T09:00:00', 'b'),
      ev('2026-06-21T20:00:00', 'c'),
    ];
    const groups = groupByDay(events, now);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday']);
    expect(groups[0]?.events).toHaveLength(2);
    expect(groups[1]?.events).toHaveLength(1);
  });

  it('returns no groups for an empty list', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
