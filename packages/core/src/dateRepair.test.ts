import { describe, expect, it } from 'vitest';
import { suggestDateRepairs, MIN_REPAIR_DELTA_DAYS } from './dateRepair.ts';
import { addDaysUTC, suggestShelfLifeDays, suggestStorageLocation } from './shelfLife.ts';

const ADDED = '2026-07-10T15:00:00.000Z';
const addedPlus = (days: number) => addDaysUTC(new Date(ADDED), days).toISOString();

const item = (
  id: string,
  name: string,
  location: string,
  expiresAt?: string,
  addedAt: string = ADDED,
) => ({ id, name, location, expiresAt, addedAt });

describe('suggestDateRepairs', () => {
  it('skips items without an expiry (user left it blank)', () => {
    expect(suggestDateRepairs([item('a', 'Milk', 'pantry')])).toEqual([]);
  });

  it('skips unparseable dates and unknown foods', () => {
    expect(suggestDateRepairs([item('a', 'Milk', 'pantry', 'garbage')])).toEqual([]);
    expect(suggestDateRepairs([item('a', 'zzqx flurbo', 'pantry', addedPlus(10))])).toEqual([]);
  });

  it('repairs the scan-flow poison case: milk stored as pantry with the 91-day freezer number', () => {
    const proposals = suggestDateRepairs([item('a', 'Milk', 'pantry', addedPlus(91))]);
    expect(proposals).toHaveLength(1);
    const p = proposals[0]!;
    expect(p.suggestedLocation).toBe('fridge');
    // dairy-category fridge number (10d), anchored at addedAt
    expect(p.suggestedExpiresAt).toBe(addedPlus(10));
    expect(p.deltaDays).toBe(-81); // expires much sooner than stored
  });

  it('repairs canned goods that got a short fresh-produce date', () => {
    const proposals = suggestDateRepairs([item('a', 'Canned tomatoes', 'pantry', addedPlus(5))]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.suggestedLocation).toBe('pantry');
    expect(proposals[0]!.deltaDays).toBeGreaterThan(100); // ~1 year, not 5 days
  });

  it('leaves agreeing items alone (right location, date within the noise floor)', () => {
    const loc = suggestStorageLocation('butter')!;
    const days = suggestShelfLifeDays({ name: 'butter', location: loc })!;
    // Stored exactly as today's inference would produce → no proposal.
    expect(suggestDateRepairs([item('a', 'Butter', loc, addedPlus(days))])).toEqual([]);
    // One day off, same location → still under MIN_REPAIR_DELTA_DAYS.
    expect(
      suggestDateRepairs([item('a', 'Butter', loc, addedPlus(days + MIN_REPAIR_DELTA_DAYS - 1))]),
    ).toEqual([]);
  });

  it('proposes on a location change even when the date barely moves', () => {
    const loc = suggestStorageLocation('butter')!; // fridge
    const days = suggestShelfLifeDays({ name: 'butter', location: loc })!;
    const proposals = suggestDateRepairs([item('a', 'Butter', 'pantry', addedPlus(days))]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.suggestedLocation).toBe(loc);
    expect(proposals[0]!.deltaDays).toBe(0);
  });

  it('anchors the fresh estimate at addedAt, not now', () => {
    const oldAdded = '2026-06-01T09:00:00.000Z';
    const proposals = suggestDateRepairs([
      item('a', 'Milk', 'pantry', addDaysUTC(new Date(oldAdded), 91).toISOString(), oldAdded),
    ]);
    expect(proposals).toHaveLength(1);
    // 10 dairy-fridge days from JUNE 1, not from today.
    expect(proposals[0]!.suggestedExpiresAt).toBe(addDaysUTC(new Date(oldAdded), 10).toISOString());
  });

  it('preserves input order across mixed items', () => {
    const proposals = suggestDateRepairs([
      item('skip', 'Salt', 'pantry'), // no expiry
      item('first', 'Milk', 'pantry', addedPlus(91)),
      item('second', 'Canned tomatoes', 'pantry', addedPlus(5)),
    ]);
    expect(proposals.map((p) => p.itemId)).toEqual(['first', 'second']);
  });
});
