/**
 * rowToShoppingListItem — the single SQLite-row → domain mapper for
 * shopping_list_items (the mapRow.ts pattern: snake_case SQLite primitives →
 * validated camelCase domain shape; one mapper, every consumer imports it).
 */
import { parseShoppingListItem, type ShoppingListItem } from '@breadbox/core';

import type { ShoppingListItemRow } from './schema';

export function rowToShoppingListItem(row: ShoppingListItemRow): ShoppingListItem {
  return parseShoppingListItem({
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit ?? undefined,
    note: row.note ?? undefined,
    checked: row.checked === 1,
    source: row.source,
    addedBy: row.added_by,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  });
}
