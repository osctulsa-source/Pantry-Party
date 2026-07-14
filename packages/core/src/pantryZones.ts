/**
 * Pantry browse zones — how the Pantry screen groups items for filtering.
 *
 * Zones are derived from category (with name fallback via categorizeByName).
 * Each item maps to exactly one zone (except "all", which is a UI filter only).
 */
import type { PantryItem } from './schema.ts';
import { categorizeByName } from './shelfLife.ts';

export type PantryZone = 'fresh' | 'drinks' | 'shelfStable';

export const PANTRY_ZONE_ORDER: PantryZone[] = ['fresh', 'drinks', 'shelfStable'];

export const PANTRY_ZONE_LABELS: Record<PantryZone, string> = {
  fresh: 'Fresh',
  drinks: 'Drinks',
  shelfStable: 'Shelf-stable',
};

function effectiveCategory(item: Pick<PantryItem, 'name' | 'category'>): string {
  // Prefer live name inference over a persisted category. Category is auto-set
  // at insert and can be stale for compound names (e.g. "Vegetable oil" once
  // mis-tagged as produce). Fall back to the stored value when the name has
  // no keyword match (refined staples like "Barilla spaghetti").
  return (categorizeByName(item.name) ?? item.category ?? '').toLowerCase();
}

/**
 * Classify a pantry item into a browse zone. Mutually exclusive — priority:
 * drinks → fresh (perishables) → shelf-stable (everything else).
 */
export function getPantryZone(item: Pick<PantryItem, 'name' | 'category'>): PantryZone {
  const cat = effectiveCategory(item);
  if (cat === 'beverage') return 'drinks';
  if (cat === 'produce' || cat === 'dairy' || cat === 'meat' || cat === 'bakery') return 'fresh';
  return 'shelfStable';
}

export function itemMatchesPantryZone(
  item: Pick<PantryItem, 'name' | 'category'>,
  zone: PantryZone | 'all',
): boolean {
  if (zone === 'all') return true;
  return getPantryZone(item) === zone;
}
