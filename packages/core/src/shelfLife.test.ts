import { describe, it, expect } from 'vitest';

import {
  addDaysUTC,
  categorizeByName,
  suggestExpiryISO,
  suggestShelfLifeDays,
  suggestStorageLocation,
} from './shelfLife';

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

  it('keeps pantry compounds out of produce (vegetable oil, canned tomatoes)', () => {
    expect(categorizeByName('Vegetable oil')).toBe('pantry');
    expect(categorizeByName('Avocado oil')).toBe('pantry');
    expect(categorizeByName('Canned tomatoes')).toBe('pantry');
    expect(categorizeByName('Tomato')).toBe('produce');
    expect(categorizeByName('Vegetables')).toBe('produce');
  });

  it('routes branded sodas and sports drinks to beverage (the Diet Pepsi bug)', () => {
    expect(categorizeByName('Diet Pepsi')).toBe('beverage');
    expect(categorizeByName('Coke Zero')).toBe('beverage');
    expect(categorizeByName('Dr Pepper')).toBe('beverage');
    expect(categorizeByName('Dr. Pepper')).toBe('beverage');
    expect(categorizeByName('Mountain Dew')).toBe('beverage');
    expect(categorizeByName('Sprite')).toBe('beverage');
    expect(categorizeByName('Gatorade Frost')).toBe('beverage');
    expect(categorizeByName('Red Bull')).toBe('beverage');
    expect(categorizeByName('7UP')).toBe('beverage');
    expect(categorizeByName('7 Up')).toBe('beverage');
    expect(categorizeByName('Ginger ale')).toBe('beverage');
    // Brand words must not over-match unrelated foods.
    expect(categorizeByName('Artichoke hearts')).not.toBe('beverage');
    expect(categorizeByName('Black pepper')).toBe('pantry');
  });

  it('does not treat baking soda as a beverage', () => {
    expect(categorizeByName('Baking soda')).toBe('pantry');
    expect(categorizeByName('Baking powder')).toBe('pantry');
    expect(categorizeByName('Soda')).toBe('beverage');
    expect(categorizeByName('Club soda')).toBe('beverage');
  });

  it('routes tea and coffee to beverage', () => {
    expect(categorizeByName('Tea')).toBe('beverage');
    expect(categorizeByName('Coffee')).toBe('beverage');
    expect(categorizeByName('Sparkling water')).toBe('beverage');
  });

  it('returns undefined when nothing matches', () => {
    expect(categorizeByName('zorblax')).toBeUndefined();
  });
});

describe('suggestShelfLifeDays', () => {
  it('prefers an explicit category over the name when no food match', () => {
    expect(suggestShelfLifeDays({ category: 'dairy' })).toBe(10);
    // 'flour' has a food record; explicit category is ignored in favour of
    // the food tier, which is the more specific signal. Use a name that has
    // no food record to demonstrate category-over-name precedence.
    expect(suggestShelfLifeDays({ category: 'meat', name: 'zorblax' })).toBe(3);
  });

  it('falls back to category when no food match or no safe location', () => {
    // 'milk' has a food record, but the milk row is freezer-only;
    // when no location is given, DEFAULT_ORDER tries f→p→z and finds 91.
    // Without location context the food tier still answers. For a plain
    // category-only fallback, use 'milk' at 'fridge' — the food tier
    // returns null (record is freezer-only, fridge can't borrow from
    // freezer) so category (dairy 10) answers.
    expect(suggestShelfLifeDays({ name: 'whole milk', location: 'fridge' })).toBe(10);
    // 'flour' has a food record (274d); the food tier answers with a more
    // specific value than the old generic pantry 365.
    expect(suggestShelfLifeDays({ name: 'flour' })).toBe(274);
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

  it('produces an ISO suggestion from a known item (+10 for dairy, milk at fridge)', () => {
    expect(suggestExpiryISO({ name: 'milk', location: 'fridge' }, now)).toBe('2026-06-18T00:00:00.000Z');
  });

  it('returns null for unknown items', () => {
    expect(suggestExpiryISO({ name: 'zorblax' }, now)).toBeNull();
  });
});

describe('suggestShelfLifeDays — food tier (FoodKeeper data)', () => {
  it('is location-aware: chicken in the freezer lasts months, in the fridge days', () => {
    const fridge = suggestShelfLifeDays({ name: 'chicken', location: 'fridge' });
    const freezer = suggestShelfLifeDays({ name: 'chicken', location: 'freezer' });
    expect(fridge).not.toBeNull();
    expect(freezer).not.toBeNull();
    expect(fridge!).toBeLessThanOrEqual(3);
    expect(freezer!).toBeGreaterThanOrEqual(200);
  });

  it('food match beats the category default (butter != generic dairy 10d)', () => {
    // Old behavior: 'butter' -> dairy -> 10. FoodKeeper: fridge ~46 days.
    expect(suggestShelfLifeDays({ name: 'butter', location: 'fridge' })).toBeGreaterThan(10);
  });

  it('defers to the category tier when the food tier has no safe number (milk at fridge)', () => {
    // The plain milk record is freezer-only; direction-aware lookup returns
    // null for fridge, and the dairy category default (10) answers instead.
    expect(suggestShelfLifeDays({ name: 'milk', location: 'fridge' })).toBe(10);
  });

  it('keeps the category tier as fallback for foods the dataset lacks', () => {
    // categorizeByName covers 'kombucha' (beverage); FoodKeeper does not.
    expect(suggestShelfLifeDays({ name: 'kombucha' })).toBe(90);
  });

  it('still returns null with no signal at all', () => {
    expect(suggestShelfLifeDays({ name: 'zzqx flurbo' })).toBeNull();
  });

  it('suggestExpiryISO forwards the location', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const fridge = suggestExpiryISO({ name: 'chicken', location: 'fridge' }, now);
    const freezer = suggestExpiryISO({ name: 'chicken', location: 'freezer' }, now);
    expect(fridge).not.toBeNull();
    expect(freezer).not.toBeNull();
    expect(new Date(freezer!).getTime()).toBeGreaterThan(new Date(fridge!).getTime());
  });
});

describe('suggestStorageLocation', () => {
  it('puts fresh foods in the fridge', () => {
    expect(suggestStorageLocation('chicken')).toBe('fridge');
    expect(suggestStorageLocation('spinach')).toBe('fridge');
    expect(suggestStorageLocation('eggs')).toBe('fridge');
  });

  it('puts shelf-stable foods in the pantry (the scan-flow regression case)', () => {
    // Canned tomatoes keep ~18 months in the pantry but only days once opened
    // in the fridge — the longer duration marks the natural home. This is the
    // record whose fridge-first estimate made scanned pantries look expired.
    expect(suggestStorageLocation('canned tomatoes')).toBe('pantry');
    expect(suggestStorageLocation('rice')).toBe('pantry');
    expect(suggestStorageLocation('flour')).toBe('pantry');
  });

  it('treats fridge-longer records as fridge foods (butter: 2d counter / ~46d fridge)', () => {
    expect(suggestStorageLocation('butter')).toBe('fridge');
  });

  it('ignores freezer-only records and answers from the category (milk → dairy → fridge)', () => {
    expect(suggestStorageLocation('milk')).toBe('fridge');
  });

  it('falls back to the category tier for foods the dataset lacks', () => {
    expect(suggestStorageLocation('kombucha')).toBe('pantry'); // beverage
  });

  it('returns null with no signal at all', () => {
    expect(suggestStorageLocation('zzqx flurbo')).toBeNull();
  });

  it('the suggested location and its expiry estimate are consistent', () => {
    // The actual scan-flow contract: estimate expiry AT the suggested location.
    const loc = suggestStorageLocation('canned tomatoes');
    expect(loc).toBe('pantry');
    const days = suggestShelfLifeDays({ name: 'canned tomatoes', location: loc! });
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(100); // shelf-stable, not "5 days in the fridge"
  });
});
