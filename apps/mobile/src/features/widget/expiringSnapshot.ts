/**
 * Expiring-soon snapshot — the small, serializable payload the lock-screen /
 * home-screen widget renders. The widget can't run JS or read PowerSync, so the
 * RN app computes this from the live pantry and writes it into the shared App
 * Group (see useExpiringWidget); targets/widget/index.swift decodes this shape.
 *
 * Pure + dependency-light on purpose: the only logic is "what's expiring and
 * which is most urgent", reusing @breadbox/core's expiry helpers so the widget
 * agrees with the rest of the app.
 *
 * The App Group id is FIXED (no .dev suffix) so the JS literal here, the
 * entitlement in app.config.js, and the Swift literal in index.swift always
 * match across the dev/prod variants.
 */
import { daysUntilExpiry, getExpiryStatus, type PantryItem } from '@breadbox/core';

export const APP_GROUP = 'group.com.osctulsa.pantryparty';
export const SNAPSHOT_KEY = 'expiring';

export interface ExpiringSnapshot {
  /** How many items are expiring soon or already expired. */
  count: number;
  /** Name of the most urgent item, or null when nothing is expiring. */
  soonestName: string | null;
  /** Relative label for that item: "expired" | "today" | "tomorrow" | "in N days". */
  soonestLabel: string | null;
  /** Epoch ms the snapshot was built (staleness / debug). */
  updatedAt: number;
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
    updatedAt: now.getTime(),
  };
}
