/**
 * Pantry items eligible for "Add something else you used" in the cook sheet:
 * not already showing as a row (matched, fallback, or already added as an
 * extra), and matching the search query by substring (case-insensitive).
 */
import type { PantryItem } from '@breadbox/core';

export function filterAddableItems(
  pantry: PantryItem[],
  alreadyShownIds: ReadonlySet<string>,
  query: string,
): PantryItem[] {
  const q = query.trim().toLowerCase();
  return pantry
    .filter((p) => !alreadyShownIds.has(p.id))
    .filter((p) => q.length === 0 || p.name.toLowerCase().includes(q));
}
