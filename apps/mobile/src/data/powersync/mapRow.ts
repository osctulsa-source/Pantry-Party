/**
 * rowToPantryItem — THE single SQLite-row → domain mapper.
 *
 * PowerSync's local rows are snake_case with SQLite primitives (integers for
 * booleans, nullable text); @breadbox/core's PantryItem is the validated
 * camelCase domain shape. This mapper is the one place that translation
 * happens — previously four byte-identical copies lived in PantryScreen,
 * ExpiringSoonScreen, powerSyncPantry, and usePantryItems, which taxed every
 * schema addition four times over (unit, then brand…). Fill-level lands next;
 * it should touch exactly one file.
 *
 * Validation via parsePantryItem is intentional: SQLite stores text/int/real,
 * and we want runtime certainty the shape matches what screens expect.
 *
 * Category fallback: rows added before auto-categorization (or whose name
 * matched nothing at insert) have no stored category. We infer it from the name
 * at read time (categorizeByName) so the Pantry's CategoryIcon lights up for
 * every item without a write-backfill — which the upload-proxy's PATCH
 * allowlist wouldn't accept anyway. A stored category always wins.
 */
import { categorizeByName, parsePantryItem, type PantryItem } from '@breadbox/core';

import type { PantryItemRow } from './schema';

export function rowToPantryItem(row: PantryItemRow): PantryItem {
  return parsePantryItem({
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    brand: row.brand ?? undefined,
    category: row.category ?? categorizeByName(row.name) ?? undefined,
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
    fillLevel: row.fill_level ?? undefined,
  });
}
