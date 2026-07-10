/**
 * addToShoppingList — the shared write path for list feeders.
 *
 * Dedupe-aware: if an unchecked, non-deleted item with the same name (case-
 * insensitive) is already on the household's list, this is a no-op reporting
 * 'already' — running-low taps and (next PR) recipe missing-ingredient adds
 * shouldn't pile up duplicates. Source records provenance ('low', 'recipe',
 * 'restock', 'manual') per the shoppingList schema.
 */
import * as Crypto from 'expo-crypto';
import type { ShoppingSource } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export async function addToShoppingList(opts: {
  householdId: string;
  userId: string;
  name: string;
  source: ShoppingSource;
  quantity?: number;
  unit?: string | null;
  runId?: string | null;
}): Promise<'added' | 'already'> {
  const db = getPowerSync();
  const existing = await db.getAll<{ id: string }>(
    'SELECT id FROM shopping_list_items WHERE household_id = ? AND deleted = 0 AND checked = 0 AND LOWER(name) = LOWER(?) LIMIT 1',
    [opts.householdId, opts.name],
  );
  if (existing.length > 0) return 'already';
  await db.execute(
    `INSERT INTO shopping_list_items
       (id, household_id, name, quantity, unit, checked, source, added_by, added_at, run_id, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      opts.householdId,
      opts.name,
      opts.quantity ?? 1,
      opts.unit ?? null,
      0,
      opts.source,
      opts.userId,
      new Date().toISOString(),
      opts.runId ?? null,
      Date.now(),
      0,
    ],
  );
  return 'added';
}
