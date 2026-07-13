import type { ShoppingListItem } from '@breadbox/core';

import { buildShoppingSnapshot, SHOPPING_WIDGET_MAX_ITEMS } from './shoppingSnapshot';

let seq = 0;
function item(name: string, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${hex}`,
    householdId: '00000000-0000-4000-8000-000000000001',
    name,
    quantity: 1,
    checked: false,
    source: 'manual',
    addedBy: 'tester',
    addedAt: '2026-07-06T12:00:00.000Z',
    updatedAt: 0,
    deleted: false,
    ...overrides,
  };
}

describe('buildShoppingSnapshot', () => {
  it('is empty when everything is checked or deleted', () => {
    const snapshot = buildShoppingSnapshot([
      item('Milk', { checked: true }),
      item('Bread', { deleted: true }),
    ]);
    expect(snapshot).toEqual({ uncheckedCount: 0, items: [] });
  });

  it('lists unchecked items with quantity/unit details', () => {
    const snapshot = buildShoppingSnapshot([
      item('Milk'),
      item('Flour', { quantity: 2, unit: 'lb' }),
      item('Eggs', { quantity: 12 }),
      item('Butter', { checked: true }),
    ]);
    expect(snapshot.uncheckedCount).toBe(3);
    expect(snapshot.items).toEqual([
      { name: 'Milk', detail: '' },
      { name: 'Flour', detail: '2 lb' },
      { name: 'Eggs', detail: '×12' },
    ]);
  });

  it('caps the list for the large layout but keeps the full count', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`Item ${i}`));
    const snapshot = buildShoppingSnapshot(many);
    expect(snapshot.uncheckedCount).toBe(12);
    expect(snapshot.items).toHaveLength(SHOPPING_WIDGET_MAX_ITEMS);
  });
});
