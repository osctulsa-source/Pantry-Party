import { describe, it, expect } from 'vitest';

import { addDaysUTC, categorizeByName, suggestExpiryISO, suggestShelfLifeDays } from './shelfLife';

describe('categorizeByName', () => {
  it('maps common foods to categories', () => {
    expect(categorizeByName('Whole milk')).toBe('dairy');
    expect(categorizeByName('Chicken thighs')).toBe('meat');
    expect(categorizeByName('Baby spinach')).toBe('produce');
    expect(categorizeByName('Sourdough bread')).toBe('bakery');
    expect(categorizeByName('All-purpose flour')).toBe('pantry');
  });

  it('checks specific intents before broad ones (orange juice → beverage)', () => {
    expect(categorizeByName('Orange juice')).toBe('beverage');
    expect(categorizeByName('Orange')).toBe('produce');
  });

  it('returns undefined when nothing matches', () => {
    expect(categorizeByName('zorblax')).toBeUndefined();
  });
});

describe('suggestShelfLifeDays', () => {
  it('prefers an explicit category over the name', () => {
    expect(suggestShelfLifeDays({ category: 'dairy' })).toBe(10);
    expect(suggestShelfLifeDays({ category: 'meat', name: 'flour' })).toBe(3);
  });

  it('falls back to name inference', () => {
    expect(suggestShelfLifeDays({ name: 'whole milk' })).toBe(10);
    expect(suggestShelfLifeDays({ name: 'flour' })).toBe(365);
  });

  it('returns null when there is no signal', () => {
    expect(suggestShelfLifeDays({ name: 'zorblax' })).toBeNull();
    expect(suggestShelfLifeDays({})).toBeNull();
  });
});

describe('addDaysUTC / suggestExpiryISO', () => {
  const now = new Date('2026-06-08T15:00:00.000Z');

  it('adds days at UTC midnight', () => {
    expect(addDaysUTC(now, 7).toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('produces an ISO suggestion from a known item (+10 for dairy)', () => {
    expect(suggestExpiryISO({ name: 'milk' }, now)).toBe('2026-06-18T00:00:00.000Z');
  });

  it('returns null for unknown items', () => {
    expect(suggestExpiryISO({ name: 'zorblax' }, now)).toBeNull();
  });
});
