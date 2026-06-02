/**
 * Expiry-notification scheduling — pure reconciler.
 *
 * Pairs with ./expiry.ts. Lives in @breadbox/core (not the mobile app) so it stays
 * vitest-testable and locale-naive. The side-effecting layer (permissions, expo-notifications,
 * AppState) lives in apps/mobile/src/features/expiry — this module never touches platform APIs.
 *
 * Reconcile strategy is stateless: the mobile-side caller does cancelAll() then schedules the
 * full intent set on every reconcile. That makes the operation idempotent by construction —
 * computing the same intents twice and re-scheduling them yields the same notifications.
 */

import { DEFAULT_EXPIRY_WARNING_DAYS } from "./expiry.ts";

export interface ScheduleIntent {
  itemId: string;
  itemName: string;
  triggerDate: Date;
  /** Calendar days from triggerDate to the item's expiry. >= 0. Drives the body string. */
  daysUntilExpiry: number;
}

/**
 * Side-effecting notification driver. Implementations live in the mobile app
 * (expo-notifications) and in tests (an in-memory recorder). This module never
 * imports an implementation — only the interface.
 */
export interface NotificationScheduler {
  cancelAll(): Promise<void>;
  schedule(input: {
    id: string;
    title: string;
    body: string;
    triggerDate: Date;
  }): Promise<void>;
}

const MS_PER_DAY = 86_400_000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Compute the schedule intents for a list of items at a given moment.
 *
 * Skipped (no intent emitted):
 *  - items with no expiresAt
 *  - items with an unparseable expiresAt
 *  - items already expired (expiresAt <= now): in-app red text is the signal,
 *    we don't nag after the fact.
 *
 * Future items:
 *  - "warning zone start" = expiresAt - warningDays days
 *  - if warningStart > now → trigger at warningStart 09:00 UTC (timezone-naive v1)
 *  - if warningStart <= now (already in the warning zone) → trigger at now + 5 minutes,
 *    so the notification fires shortly after open instead of as a jarring immediate popup.
 */
export function computeScheduleIntents(
  items: Array<{ id: string; name: string; expiresAt?: string }>,
  now: Date,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
): ScheduleIntent[] {
  const intents: ScheduleIntent[] = [];
  const nowMs = now.getTime();

  for (const item of items) {
    if (!item.expiresAt) continue;
    const expiry = new Date(item.expiresAt);
    const expiryMs = expiry.getTime();
    if (Number.isNaN(expiryMs)) continue;
    if (expiryMs <= nowMs) continue;

    const warningStartMs = expiryMs - warningDays * MS_PER_DAY;
    let triggerDate: Date;
    if (warningStartMs > nowMs) {
      const t = new Date(warningStartMs);
      t.setUTCHours(9, 0, 0, 0);
      triggerDate = t;
    } else {
      triggerDate = new Date(nowMs + FIVE_MINUTES_MS);
    }

    const daysUntilExpiry = Math.max(
      0,
      Math.round((expiryMs - triggerDate.getTime()) / MS_PER_DAY),
    );

    intents.push({
      itemId: item.id,
      itemName: item.name,
      triggerDate,
      daysUntilExpiry,
    });
  }

  return intents;
}
