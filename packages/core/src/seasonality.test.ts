import { describe, it, expect } from 'vitest';

import { isInSeason, peakSeason, inSeasonNow } from './seasonality.ts';

describe('isInSeason', () => {
  it('is true in a peak month and false otherwise', () => {
    expect(isInSeason('grapes', new Date('2026-09-15'))).toBe(true); // Sept
    expect(isInSeason('grapes', new Date('2026-02-15'))).toBe(false); // Feb
  });

  it('is case-insensitive on the food key', () => {
    expect(isInSeason('Tomatoes', new Date('2026-07-01'))).toBe(true);
  });

  it('returns null for a food with no seasonality data (unknown, not out-of-season)', () => {
    expect(isInSeason('pasta', new Date('2026-07-01'))).toBeNull();
  });
});

describe('peakSeason', () => {
  it('names the season(s) for a known food', () => {
    expect(peakSeason('apples')).toBe('autumn'); // Sep/Oct/Nov
    expect(peakSeason('grapes')).toBe('summer & autumn'); // Aug(summer) + Sep/Oct(autumn)
  });

  it('is null for unknown foods', () => {
    expect(peakSeason('rice')).toBeNull();
  });
});

describe('inSeasonNow', () => {
  it('filters a list to those in season on the date', () => {
    const foods = ['grapes', 'apples', 'lemon', 'pasta'];
    // September: grapes + apples in season, lemon (winter) not, pasta unknown
    expect(inSeasonNow(foods, new Date('2026-09-20')).sort()).toEqual(['apples', 'grapes']);
  });
});
