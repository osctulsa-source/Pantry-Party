/**
 * Build rows for CookedItSheet — matched pantry items when possible; never dump
 * the whole pantry. Fallback: up to 8 urgent (non-fresh) items for manual mark.
 */
import { getExpiryStatus, matchCookedItems, type PantryItem } from '@breadbox/core';

export interface CookedSheetItemRow {
  itemId: string;
  itemName: string;
  quantity: number;
  matched: boolean;
  matchedIngredient?: string;
}

const FALLBACK_CAP = 8;

export function buildCookedSheetItems(
  ingredientNames: string[],
  pantry: PantryItem[],
  now: Date = new Date(),
): CookedSheetItemRow[] {
  const matches = matchCookedItems(
    ingredientNames,
    pantry.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
  );
  if (matches.length > 0) {
    return matches.map((m) => ({
      itemId: m.itemId,
      itemName: m.itemName,
      quantity: m.quantity,
      matched: true,
      matchedIngredient: m.matchedIngredient,
    }));
  }

  return pantry
    .filter((i) => getExpiryStatus(i, now) !== 'fresh')
    .sort((a, b) => {
      const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return ae - be;
    })
    .slice(0, FALLBACK_CAP)
    .map((i) => ({
      itemId: i.id,
      itemName: i.name,
      quantity: i.quantity,
      matched: false,
    }));
}
