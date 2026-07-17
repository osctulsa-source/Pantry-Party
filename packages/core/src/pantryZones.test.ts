import { describe, expect, it } from 'vitest';

import { getPantryZone } from './pantryZones';

describe('getPantryZone', () => {
  it('routes perishables to fresh', () => {
    expect(getPantryZone({ name: 'Baby spinach', category: 'produce' })).toBe('fresh');
    expect(getPantryZone({ name: 'Whole milk', category: 'dairy' })).toBe('fresh');
    expect(getPantryZone({ name: 'Chicken thighs', category: 'meat' })).toBe('fresh');
    expect(getPantryZone({ name: 'Sourdough', category: 'bakery' })).toBe('fresh');
  });

  it('routes beverages to drinks', () => {
    expect(getPantryZone({ name: 'Orange juice', category: 'beverage' })).toBe('drinks');
    expect(getPantryZone({ name: 'Tea', category: undefined })).toBe('drinks');
  });

  it('routes branded sodas with no stored category to drinks (scanned items)', () => {
    // Scanned products store category = null when name inference misses;
    // brand names must still land in the drinks zone.
    expect(getPantryZone({ name: 'Diet Pepsi', category: undefined })).toBe('drinks');
    expect(getPantryZone({ name: 'Mountain Dew', category: undefined })).toBe('drinks');
  });

  it('does not put pantry compounds in fresh even if category was stale', () => {
    // Persisted category can be wrong from older inference; name wins.
    expect(getPantryZone({ name: 'Vegetable oil', category: 'produce' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Canned tomatoes', category: 'produce' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Baking soda', category: 'beverage' })).toBe('shelfStable');
  });

  it('routes shelf-stable items to shelf-stable', () => {
    expect(getPantryZone({ name: 'All-purpose flour', category: 'pantry' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Paprika', category: 'pantry' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Frozen peas', category: 'frozen' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Mystery item', category: undefined })).toBe('shelfStable');
  });
});
