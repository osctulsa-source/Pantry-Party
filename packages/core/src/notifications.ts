/**
 * Expiry-notification scheduling — pure reconciler.
 *
 * Pairs with ./expiry.ts. Lives in @breadbox/core (not the mobile app) so it stays
 * vitest-testable. The side-effecting layer (permissions, expo-notifications,
 * AppState) lives in apps/mobile/src/features/expiry — this module never touches platform APIs.
 *
 * Reconcile strategy is stateless: the mobile-side caller does cancelAll() then schedules the
 * full intent set on every reconcile. That makes the operation idempotent by construction —
 * computing the same intents twice and re-scheduling them yields the same notifications.
 *
 * Timezone (changed June 2026, external review): the morning pin is 09:00 in the
 * RUNTIME'S LOCAL timezone, not 09:00 UTC. On device, the runtime timezone is the
 * user's timezone, and the JS engine resolves DST per trigger date via the host tz
 * database. The previous UTC pin delivered "expires tomorrow" at 1–2am Pacific /
 * 4–5am Eastern, and the evening before in Tokyo. This module stays pure: same
 * items + same now + same host timezone → same intents. Tests construct expected
 * values with the same local-frame calls, so they're host-timezone-agnostic.
 *
 * Notification budget: iOS keeps at most 64 pending local notifications per app and
 * silently drops the rest (Android's cap is higher but also finite). The reconciler
 * therefore emits at most MAX_SCHEDULE_INTENTS intents, keeping the SOONEST-firing
 * ones — the urgent items are the ones that must survive. Because the mobile caller
 * wipes and re-schedules on every reconcile (items change, app foreground), dropped
 * far-future intents are re-considered each time and enter the set as their trigger
 * dates approach.
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

/** Local-time hour of day the warning notification aims for. */
export const NOTIFY_LOCAL_HOUR = 9;

/**
 * iOS pending-local-notification budget. Intents are capped to this count,
 * soonest trigger dates first.
 */
export const MAX_SCHEDULE_INTENTS = 64;

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
 *  - if warningStart > now → trigger at 09:00 LOCAL time on warningStart's day;
 *    if that pin has already passed (e.g. warningStart is 11pm tonight and it's
 *    already afternoon), fall back to now + 5 minutes so the trigger is never
 *    in the past (a past DATE trigger fires immediately, which reads as a
 *    jarring popup at app-open).
 *  - if warningStart <= now (already in the warning zone) → trigger at now + 5
 *    minutes, so the notification fires shortly after open instead of as an
 *    immediate popup.
 *
 * Output is capped at maxIntents (default MAX_SCHEDULE_INTENTS = the iOS
 * 64-pending limit). When the cap bites, the soonest-firing intents are kept;
 * surviving intents preserve the input items' relative order.
 */
export function computeScheduleIntents(
  items: Array<{ id: string; name: string; expiresAt?: string }>,
  now: Date,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
  maxIntents: number = MAX_SCHEDULE_INTENTS,
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
      // 09:00 in the runtime's local timezone (the device's timezone on mobile).
      t.setHours(NOTIFY_LOCAL_HOUR, 0, 0, 0);
      // The pin can land before `now` (warning zone starts late tonight, it's
      // already past 9am) — never schedule in the past.
      triggerDate = t.getTime() > nowMs ? t : new Date(nowMs + FIVE_MINUTES_MS);
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

  if (intents.length <= maxIntents) return intents;

  // Over budget: keep the soonest-firing intents (the urgent ones must survive
  // the OS cap), but preserve the input order among the survivors.
  const keep = new Set(
    [...intents]
      .sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime())
      .slice(0, maxIntents)
      .map((i) => i.itemId),
  );
  return intents.filter((i) => keep.has(i.itemId));
}
