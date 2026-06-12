/**
 * Safe-merge deduplication for the pantry list (pure, no I/O).
 *
 * The pantry stores one row per capture event, so adding three cans of beans on
 * three trips produces three rows — visual fatigue, and it buries the items that
 * actually need attention. This collapses *identical* rows into one display
 * group with a summed quantity.
 *
 * SAFE by construction: two items merge ONLY when every DISPLAYED dimension is
 * identical — name, brand, location, unit, AND exact expiry. The expiry rule is
 * the important one: two cans with different dates must NEVER merge, or the
 * sooner-expiring can disappears behind the later one and the whole "use it
 * before it expires" promise breaks. Unit is in the key too, because you can't
 * honestly sum 1 L + 2 cup. The failure mode is therefore *under*-merging (two
 * rows that look alike but differ in some field stay separate) — which is
 * exactly the conservative direction we want.
 *
 * Expiry is matched on the exact stored string. App-created dates all use the
 * same UTC-midnight ISO format (see ExpiryField / addDaysUTC), so same-day items
 * share a string and merge; any oddly-formatted legacy date simply stays its own
 * row. Order is preserved: a group sits where its first member was, and members
 * keep their order — so a soonest-first list stays soonest-first.
 */

import type { PantryItem } from './schema.ts';

export interface PantryItemGroup {
  /** Stable merge signature (see itemMergeKey). */
  key: string;
  /** Members in input order (so soonest-first is preserved). */
  items: PantryItem[];
  /** First member — drives tap-to-edit and the row's status/expiry rendering. */
  representative: PantryItem;
  /** Number of merged entries; > 1 means a real merge happened. */
  count: number;
  /** Sum of the members' quantities. */
  totalQuantity: number;
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * The merge signature. Items sharing this exact key are considered the same
 * physical stock and collapse into one row. Includes every displayed field so
 * the merged row can't misrepresent any of them.
 */
export function itemMergeKey(item: PantryItem): string {
  return [
    norm(item.name),
    norm(item.brand),
    norm(item.location),
    norm(item.unit),
    item.expiresAt ?? '',
  ].join('|');
}

/**
 * Collapse runs of identical items into display groups. Singletons become
 * groups of one (count 1) so callers can render every row uniformly.
 */
export function groupIdenticalItems(items: PantryItem[]): PantryItemGroup[] {
  const groups: PantryItemGroup[] = [];
  const byKey = new Map<string, PantryItemGroup>();
  for (const item of items) {
    const key = itemMergeKey(item);
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(item);
      existing.count += 1;
      existing.totalQuantity += item.quantity;
    } else {
      const group: PantryItemGroup = {
        key,
        items: [item],
        representative: item,
        count: 1,
        totalQuantity: item.quantity,
      };
      byKey.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}
