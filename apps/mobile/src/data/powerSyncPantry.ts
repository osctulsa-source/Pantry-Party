/**
 * PowerSync-backed PantryRepository. Drop-in replacement for stubPantry:
 * same interface, real sync.
 *
 * Reads rows from the local SQLite (populated by PowerSync from the upstream
 * Postgres), maps snake_case columns to camelCase, validates each row through
 * @breadbox/core's parsePantryItem before returning. Validation is intentional —
 * SQLite stores everything as text/integer/real, and we want runtime certainty
 * the data shape matches what the screen expects.
 */
import { parsePantryItem, type PantryItem } from '@breadbox/core';
import type { PantryRepository } from './stubPantry';
import { getPowerSync } from './powersync/db';
import type { PantryItemRow } from './powersync/schema';

function rowToPantryItem(row: PantryItemRow): PantryItem {
  return parsePantryItem({
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    barcode: row.barcode ?? undefined,
    quantity: row.quantity,
    unit: row.unit ?? undefined,
    location: row.location,
    addedAt: row.added_at,
    expiresAt: row.expires_at ?? undefined,
    source: row.source,
    addedBy: row.added_by,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  });
}

export const powerSyncPantry: PantryRepository = {
  async list(): Promise<PantryItem[]> {
    const db = getPowerSync();
    const rows = await db.getAll<PantryItemRow>(
      'SELECT * FROM pantry_items WHERE deleted = 0 ORDER BY name',
    );
    return rows.map(rowToPantryItem);
  },
};
