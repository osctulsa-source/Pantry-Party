/**
 * Shopping-list snapshot — the serializable payload the "Shopping List" widget
 * renders. Same pattern as expiringSnapshot: the RN app computes this from the
 * synced shopping_list_items and pushes it via updateSnapshot; the widget
 * extension just renders props.
 *
 * Unchecked items lead (they're what you still need at the store), newest
 * first — matching ShoppingScreen's ordering.
 */
import type { ShoppingListItem } from '@breadbox/core';

/** Enough rows for the large family; smaller families slice further down. */
export const SHOPPING_WIDGET_MAX_ITEMS = 9;

export interface ShoppingWidgetItem {
  name: string;
  /** "2 lb" style suffix when quantity/unit are meaningful; empty otherwise. */
  detail: string;
}

export interface ShoppingSnapshot {
  /** Items still to buy (unchecked, not deleted). */
  uncheckedCount: number;
  /** The first unchecked items (newest first), capped for the large layout. */
  items: ShoppingWidgetItem[];
}

function itemDetail(item: ShoppingListItem): string {
  if (item.quantity <= 1 && !item.unit) return '';
  return item.unit ? `${item.quantity} ${item.unit}` : `×${item.quantity}`;
}

export function buildShoppingSnapshot(items: ShoppingListItem[]): ShoppingSnapshot {
  const unchecked = items.filter((i) => !i.deleted && !i.checked);
  return {
    uncheckedCount: unchecked.length,
    items: unchecked.slice(0, SHOPPING_WIDGET_MAX_ITEMS).map((i) => ({
      name: i.name,
      detail: itemDetail(i),
    })),
  };
}
