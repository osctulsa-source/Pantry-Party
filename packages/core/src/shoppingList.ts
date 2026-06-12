/**
 * ShoppingListItem — the canonical shopping-list schema (August arc).
 *
 * One shared list per household (v1): items live directly against
 * household_id, no lists table. Checked items stay on the list (dimmed)
 * until "Clear checked" tombstones them — the unload moment can offer
 * "add to pantry?" from a checked item.
 *
 * `source` records provenance for analytics + UX copy:
 *   manual  — typed in
 *   recipe  — what's-missing from a Cook This card
 *   restock — re-buy of a consumed pantry item
 *   low     — running-low signal (count pips ≤2 or fill level ≤¼)
 */

import { z } from "zod";

export const SHOPPING_SOURCES = ["manual", "recipe", "restock", "low"] as const;
export const ShoppingSource = z.enum(SHOPPING_SOURCES);
export type ShoppingSource = z.infer<typeof ShoppingSource>;

export const ShoppingListItem = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),

  name: z.string().min(1).max(120),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().max(20).optional(),
  note: z.string().max(200).optional(),

  checked: z.boolean().default(false),
  source: ShoppingSource.default("manual"),

  addedBy: z.string(),
  addedAt: z.string().datetime(),

  // Sync bookkeeping — engine-owned, mirrors PantryItem.
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type ShoppingListItem = z.infer<typeof ShoppingListItem>;

/** Validate a row at the read boundary. Throws on bad shape. */
export function parseShoppingListItem(input: unknown): ShoppingListItem {
  return ShoppingListItem.parse(input);
}
