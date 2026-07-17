import { describe, expect, it } from 'vitest';

import { categoryFromOffTags } from './offCategory';
import { DEFAULT_SHELF_LIFE } from './schema';

describe('categoryFromOffTags', () => {
  it('maps a branded soda (the Diet Pepsi case)', () => {
    expect(categoryFromOffTags(['en:beverages', 'en:carbonated-drinks', 'en:sodas'])).toBe('beverage');
  });

  it('preservation outranks the food word (canned corn is pantry, not produce)', () => {
    expect(categoryFromOffTags(['en:canned-foods', 'en:vegetables', 'en:canned-vegetables'])).toBe('pantry');
    expect(categoryFromOffTags(['en:dried-fruits', 'en:fruits'])).toBe('pantry');
  });

  it('frozen outranks everything', () => {
    expect(categoryFromOffTags(['en:frozen-foods', 'en:pizzas'])).toBe('frozen');
    expect(categoryFromOffTags(['en:frozen-foods', 'en:vegetables'])).toBe('frozen');
  });

  it('maps dairy, meat, bakery, produce', () => {
    expect(categoryFromOffTags(['en:dairies', 'en:fermented-foods', 'en:yogurts'])).toBe('dairy');
    expect(categoryFromOffTags(['en:meats', 'en:poultry', 'en:chicken-breasts'])).toBe('meat');
    expect(categoryFromOffTags(['en:breads', 'en:sourdough-breads'])).toBe('bakery');
    expect(categoryFromOffTags(['en:plant-based-foods', 'en:fruits', 'en:fresh-fruits', 'en:bananas'])).toBe('produce');
  });

  it('matches compound slugs on boundaries (carbonated-waters, fruit-juices)', () => {
    expect(categoryFromOffTags(['en:carbonated-waters'])).toBe('beverage');
    expect(categoryFromOffTags(['en:fruit-juices'])).toBe('beverage');
  });

  it('locale prefixes other than en: still work, and missing prefixes are fine', () => {
    expect(categoryFromOffTags(['fr:boissons', 'en:sodas'])).toBe('beverage');
    expect(categoryFromOffTags(['sodas'])).toBe('beverage');
  });

  it('returns null with no confident match (no guessing)', () => {
    expect(categoryFromOffTags([])).toBeNull();
    expect(categoryFromOffTags(['en:plant-based-foods'])).toBeNull();
    expect(categoryFromOffTags(['en:open-beauty-facts'])).toBeNull();
  });

  it('only ever returns known app categories', () => {
    const known = new Set(Object.keys(DEFAULT_SHELF_LIFE));
    const samples: string[][] = [
      ['en:beverages'], ['en:canned-foods'], ['en:dairies'], ['en:meats'],
      ['en:breads'], ['en:frozen-foods'], ['en:vegetables'], ['en:snacks'],
      ['en:condiments'], ['en:groceries'], ['en:mystery-tag'],
    ];
    for (const tags of samples) {
      const cat = categoryFromOffTags(tags);
      if (cat !== null) expect(known).toContain(cat);
    }
  });
});
