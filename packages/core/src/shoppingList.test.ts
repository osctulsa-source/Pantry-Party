import { describe, it, expect } from 'vitest';
import { parseShoppingListItem } from './shoppingList.ts';

describe('ShoppingListItem', () => {
  const validItem = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    householdId: '223e4567-e89b-12d3-a456-426614174000',
    name: 'Milk',
    quantity: 2,
    unit: 'ct',
    note: 'Buy organic if possible',
    checked: false,
    source: 'manual',
    addedBy: 'user-1',
    addedAt: '2026-06-30T12:00:00.000Z',
    updatedAt: Date.now(),
    deleted: false,
  };

  it('validates a correct shopping list item successfully', () => {
    const parsed = parseShoppingListItem(validItem);
    expect(parsed).toEqual(validItem);
  });

  it('throws validation error if ID is not a UUID', () => {
    const invalid = { ...validItem, id: 'not-a-uuid' };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it('throws validation error if householdId is not a UUID', () => {
    const invalid = { ...validItem, householdId: 'not-a-uuid' };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it('throws validation error if name is empty', () => {
    const invalid = { ...validItem, name: '' };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it('throws validation error if quantity is negative', () => {
    const invalid = { ...validItem, quantity: -1 };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it('throws validation error if source is invalid', () => {
    const invalid = { ...validItem, source: 'invalid-source' };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });
});
