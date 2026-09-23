import * as fs from 'fs';
import * as path from 'path';

const mockDb = { execute: jest.fn().mockResolvedValue(undefined) };
jest.mock('../../data/powersync/db', () => ({ getPowerSync: () => mockDb }));

import {
  applyPantryItemEdit,
  incrementPantryQuantity,
  restorePantryItems,
  setPantryExpiry,
  setPantryExpiryAndLocation,
  setPantryFillLevel,
  setPantryQuantity,
  tombstonePantryItems,
} from './pantryWrites';

const NOW = 1_700_000_000_000;

beforeEach(() => mockDb.execute.mockClear());

describe('pantryWrites', () => {
  it('defaults to the local PowerSync db', async () => {
    await setPantryFillLevel('a', 0.5, undefined, NOW);
    expect(mockDb.execute).toHaveBeenCalledWith(
      'UPDATE pantry_items SET fill_level = ?, updated_at = ? WHERE id = ?',
      [0.5, NOW, 'a'],
    );
  });

  it('writes through a caller-supplied transaction instead of the db', async () => {
    const tx = { execute: jest.fn().mockResolvedValue(undefined) };
    await tombstonePantryItems(['a', 'b'], tx, NOW);
    expect(mockDb.execute).not.toHaveBeenCalled();
    expect(tx.execute.mock.calls).toEqual([
      ['UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [NOW, 'a']],
      ['UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [NOW, 'b']],
    ]);
  });

  it('restores tombstoned items', async () => {
    await restorePantryItems(['a'], undefined, NOW);
    expect(mockDb.execute).toHaveBeenCalledWith(
      'UPDATE pantry_items SET deleted = 0, updated_at = ? WHERE id = ?',
      [NOW, 'a'],
    );
  });

  it('stamps every write with the same bigint clock it was given', async () => {
    await setPantryExpiry('a', null, undefined, NOW);
    await setPantryExpiryAndLocation('a', '2026-10-01T00:00:00.000Z', 'fridge', undefined, NOW);
    await setPantryQuantity('a', 2, undefined, NOW);
    await incrementPantryQuantity('a', 3, undefined, NOW);
    for (const [sql, params] of mockDb.execute.mock.calls) {
      expect(sql).toMatch(/updated_at = \?/);
      expect(params).toContain(NOW);
      expect(params[params.length - 1]).toBe('a');
    }
  });

  it('increments locally rather than setting an absolute value', async () => {
    await incrementPantryQuantity('a', 3, undefined, NOW);
    expect(mockDb.execute).toHaveBeenCalledWith(
      'UPDATE pantry_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
      [3, NOW, 'a'],
    );
  });

  it('applies the Edit Item form in column order', async () => {
    await applyPantryItemEdit(
      'a',
      {
        name: 'Milk',
        brand: null,
        quantity: 1,
        unit: 'gal',
        fillLevel: 0.5,
        location: 'fridge',
        expiresIso: null,
      },
      undefined,
      NOW,
    );
    const [, params] = mockDb.execute.mock.calls[0];
    expect(params).toEqual(['Milk', null, 1, 'gal', 0.5, 'fridge', null, NOW, 'a']);
  });
});

describe('pantry_items write chokepoint', () => {
  // Conflict-semantics changes (ADR-011/012) must land in one file. A raw
  // UPDATE elsewhere would silently bypass them.
  it('no feature code updates pantry_items outside pantryWrites.ts', () => {
    const srcRoot = path.resolve(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (entry.name === 'pantryWrites.ts') continue;
          if (/UPDATE\s+pantry_items/i.test(fs.readFileSync(full, 'utf8'))) {
            offenders.push(path.relative(srcRoot, full));
          }
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
