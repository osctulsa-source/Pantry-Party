/**
 * PowerSync-backed PantryRepository. Drop-in replacement for stubPantry:
 * same interface, real sync.
 *
 * Reads rows from the local SQLite (populated by PowerSync from the upstream
 * Postgres) and maps them through the shared rowToPantryItem mapper
 * (data/powersync/mapRow — validation included).
 */
import type { PantryItem } from '@breadbox/core';
import type { PantryRepository } from './stubPantry';
import { getPowerSync } from './powersync/db';
import { rowToPantryItem } from './powersync/mapRow';
import type { PantryItemRow } from './powersync/schema';

export const powerSyncPantry: PantryRepository = {
  async list(): Promise<PantryItem[]> {
    const db = getPowerSync();
    const rows = await db.getAll<PantryItemRow>(
      'SELECT * FROM pantry_items WHERE deleted = 0 ORDER BY name',
    );
    return rows.map(rowToPantryItem);
  },
};
