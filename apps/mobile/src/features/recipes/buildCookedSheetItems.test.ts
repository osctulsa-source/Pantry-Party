import { buildCookedSheetItems } from './buildCookedSheetItems';
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

describe('buildCookedSheetItems fillLevel passthrough', () => {
  it('carries fillLevel through for matched items', () => {
    const pantry = [item({ id: '1', name: 'Olive oil', quantity: 1, fillLevel: 0.75 })];
    const rows = buildCookedSheetItems(['olive oil'], pantry);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fillLevel).toBe(0.75);
  });

  it('carries undefined fillLevel through when the item never tracked it', () => {
    const pantry = [item({ id: '1', name: 'Olive oil', quantity: 1 })];
    const rows = buildCookedSheetItems(['olive oil'], pantry);
    expect(rows[0]?.fillLevel).toBeUndefined();
  });
});
