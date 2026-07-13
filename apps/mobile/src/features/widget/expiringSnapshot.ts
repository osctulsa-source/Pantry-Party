/**
 * Expiring-soon snapshot — the small, serializable payload the "Expiring Soon"
 * home/lock-screen widget renders. The widget extension can't run app JS or
 * read PowerSync, so the RN app computes this from the live pantry and pushes
 * it via ExpiringSoonWidget.updateSnapshot (see useExpiringWidget).
 *
 * Pure + dependency-light on purpose: the only logic is "what's expiring and
 * which is most urgent", reusing @breadbox/core's expiry helpers so the widget
 * agrees with the rest of the app.
 */
import { daysUntilExpiry, getExpiryStatus, type PantryItem } from '@breadbox/core';

/** How many item rows the medium home-screen family can show. */
export const EXPIRING_WIDGET_MAX_ITEMS = 3;

export interface ExpiringWidgetItem {
  name: string;
  /** Relative label: "expired" | "today" | "tomorrow" | "in N days". */
  label: string;
  /** Drives per-row urgency color in the widget: past date vs. approaching. */
  expired: boolean;
}

export interface ExpiringSnapshot {
  /** How many items are expiring soon or already expired. */
  count: number;
  /** Name of the most urgent item, or null when nothing is expiring. */
  soonestName: string | null;
  /** Relative label for that item, or null when nothing is expiring. */
  soonestLabel: string | null;
  /** The most urgent items (soonest first), capped for the medium layout. */
  items: ExpiringWidgetItem[];
}

/** Short relative phrase for an item's expiry, consistent with getExpiryStatus. */
export function expiringLabel(item: Pick<PantryItem, 'expiresAt'>, now: Date): string {
  const d = daysUntilExpiry(item, now);
  if (d === null) return '';
  if (d < 0) return 'expired';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

/**
 * Build the widget snapshot from the live pantry. "Expiring" = warning or
 * expired per getExpiryStatus; the most urgent is the soonest expiresAt
 * (already-expired items sort first, so the widget surfaces the worst case).
 */
export function buildExpiringSnapshot(items: PantryItem[], now: Date): ExpiringSnapshot {
  const expiring = items
    .filter((i) => i.expiresAt && getExpiryStatus(i, now) !== 'fresh')
    .sort(
      (a, b) =>
        new Date(a.expiresAt as string).getTime() - new Date(b.expiresAt as string).getTime(),
    );

  const soonest = expiring[0];
  return {
    count: expiring.length,
    soonestName: soonest ? soonest.name : null,
    soonestLabel: soonest ? expiringLabel(soonest, now) : null,
    items: expiring.slice(0, EXPIRING_WIDGET_MAX_ITEMS).map((i) => ({
      name: i.name,
      label: expiringLabel(i, now),
      expired: getExpiryStatus(i, now) === 'expired',
    })),
  };
}
