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
  });

  it('routes shelf-stable items to shelf-stable', () => {
    expect(getPantryZone({ name: 'All-purpose flour', category: 'pantry' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Paprika', category: 'pantry' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Frozen peas', category: 'frozen' })).toBe('shelfStable');
    expect(getPantryZone({ name: 'Mystery item', category: undefined })).toBe('shelfStable');
  });
});
