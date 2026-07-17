import { filterAddableItems } from './filterAddableItems';
import type { PantryItem } from '@breadbox/core';

function item(overrides: Partial<PantryItem> & { id: string; name: string }): PantryItem {
  return {
    householdId: 'h1',
    quantity: 1,
    location: 'pantry',
    addedAt: new Date().toISOString(),
    source: 'manual',
    addedBy: 'user-1',
    updatedAt: Date.now(),
    deleted: false,
    ...overrides,
  } as PantryItem;
}

describe('filterAddableItems', () => {
  const pantry = [
    item({ id: '1', name: 'Olive oil' }),
    item({ id: '2', name: 'Soy sauce' }),
    item({ id: '3', name: 'Fish sauce' }),
  ];

  it('excludes items already shown in the sheet', () => {
    const result = filterAddableItems(pantry, new Set(['1']), '');
    expect(result.map((i) => i.id)).toEqual(['2', '3']);
  });

  it('filters by case-insensitive substring match', () => {
    const result = filterAddableItems(pantry, new Set(), 'sauce');
    expect(result.map((i) => i.id).sort()).toEqual(['2', '3']);
    expect(filterAddableItems(pantry, new Set(), 'SAUCE').map((i) => i.id).sort()).toEqual(['2', '3']);
  });

  it('empty query returns every eligible item', () => {
    const result = filterAddableItems(pantry, new Set(), '');
    expect(result).toHaveLength(3);
  });

  it('empty pantry or no matches returns []', () => {
    expect(filterAddableItems([], new Set(), '')).toEqual([]);
    expect(filterAddableItems(pantry, new Set(), 'nonexistent')).toEqual([]);
  });

  it('combines exclusion and query filtering', () => {
    const result = filterAddableItems(pantry, new Set(['2']), 'sauce');
    expect(result.map((i) => i.id)).toEqual(['3']);
  });
});
