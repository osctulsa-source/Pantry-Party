import { describe, it, expect } from 'vitest';

import type { PantryItem } from './schema.ts';
import { groupIdenticalItems, itemMergeKey } from './itemGroups.ts';

let seq = 0;
function mk(over: Partial<PantryItem> & { name: string }): PantryItem {
  seq += 1;
  return {
    id: `id-${seq}`,
    householdId: 'h',
    name: over.name,
    quantity: 1,
    location: 'pantry',
    addedAt: '2026-06-01T00:00:00.000Z',
    source: 'manual',
    addedBy: 'u',
    updatedAt: 0,
    deleted: false,
    ...over,
  } as PantryItem;
}

describe('itemMergeKey', () => {
  it('is identical for items matching on every displayed field', () => {
    const a = mk({ name: 'Canned beans', brand: 'Acme', location: 'pantry', unit: 'ct' });
    const b = mk({ name: 'canned BEANS ', brand: ' acme', location: 'pantry', unit: 'ct' });
    expect(itemMergeKey(a)).toBe(itemMergeKey(b)); // case + whitespace normalized
  });

  it('differs when expiry differs', () => {
    const a = mk({ name: 'Milk', expiresAt: '2026-06-10T00:00:00.000Z' });
    const b = mk({ name: 'Milk', expiresAt: '2026-06-12T00:00:00.000Z' });
    expect(itemMergeKey(a)).not.toBe(itemMergeKey(b));
  });
});

describe('groupIdenticalItems', () => {
  it('merges identical undated items and sums their quantities', () => {
    const groups = groupIdenticalItems([
      mk({ name: 'Flour', quantity: 1 }),
      mk({ name: 'Flour', quantity: 2 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.totalQuantity).toBe(3);
    expect(groups[0]!.representative.name).toBe('Flour');
  });

  it('does NOT merge same name with different expiry (never hide the sooner one)', () => {
    const groups = groupIdenticalItems([
      mk({ name: 'Yogurt', expiresAt: '2026-06-12T00:00:00.000Z' }),
      mk({ name: 'Yogurt', expiresAt: '2026-06-14T00:00:00.000Z' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('does NOT merge same name with different unit, location, or brand', () => {
    expect(
      groupIdenticalItems([mk({ name: 'Rice', unit: 'kg' }), mk({ name: 'Rice', unit: 'cup' })]),
    ).toHaveLength(2);
    expect(
      groupIdenticalItems([mk({ name: 'Butter', location: 'fridge' }), mk({ name: 'Butter', location: 'freezer' })]),
    ).toHaveLength(2);
    expect(
      groupIdenticalItems([mk({ name: 'Soda', brand: 'A' }), mk({ name: 'Soda', brand: 'B' })]),
    ).toHaveLength(2);
  });

  it('keeps singletons as count-1 groups', () => {
    const groups = groupIdenticalItems([mk({ name: 'Eggs' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(1);
    expect(groups[0]!.totalQuantity).toBe(1);
  });

  it('preserves input order: a group sits at its first member position', () => {
    const groups = groupIdenticalItems([
      mk({ name: 'Apples' }),
      mk({ name: 'Bananas' }),
      mk({ name: 'Apples' }), // merges into the first Apples group, not a new trailing one
    ]);
    expect(groups.map((g) => g.representative.name)).toEqual(['Apples', 'Bananas']);
    expect(groups[0]!.count).toBe(2);
  });

  it('collects all member ids on the group (for whole-group actions)', () => {
    const groups = groupIdenticalItems([
      mk({ id: 'a', name: 'Tomatoes' }),
      mk({ id: 'b', name: 'Tomatoes' }),
    ]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
