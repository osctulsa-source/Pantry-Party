/**
 * Expiry-notification scheduling — pure day-DIGEST reconciler.
 *
 * Redesign (July 2026): the previous reconciler emitted ONE notification per
 * expiring item, so a grocery haul that all expired the same week produced five
 * near-identical 9am buzzes. This module instead GROUPS items by the morning
 * they'd fire and emits ONE digest per day — "3 things are getting close,
 * spinach leads" — collapsing the spam while still spreading across days as
 * items approach. The playful copy lives in ./notificationCopy.ts.
 *
 * Pairs with ./expiry.ts. Lives in @breadbox/core (not the mobile app) so it
 * stays vitest-testable. The side-effecting layer (permissions, expo-
 * notifications, AppState) lives in apps/mobile/src/features/expiry — this
 * module never touches platform APIs.
 *
 * Reconcile strategy is stateless: the mobile-side caller does cancelAll() then
 * schedules the full digest set on every reconcile. That makes the operation
 * idempotent by construction — same items + same now + same host timezone →
 * same digests (and, because the copy is seeded off the trigger day, the same
 * wording too).
 *
 * Timezone (unchanged from the per-item version): the morning pin is 09:00 in
 * the RUNTIME'S LOCAL timezone, not 09:00 UTC. On device the runtime timezone
 * is the user's, and day-grouping keys off the local calendar day so items that
 * would fire the same local morning bundle together. Tests construct expected
 * values with the same local-frame calls, so they're host-timezone-agnostic.
 *
 * Notification budget: iOS keeps at most 64 pending local notifications per app
 * and silently drops the rest. Digests are far fewer than items (≤1 per day),
 * so the cap rarely bites — but when it does, the SOONEST-firing digests are
 * kept. Because the caller wipes and re-schedules on every reconcile, dropped
 * far-future digests re-enter as their trigger dates approach.
 */

import { DEFAULT_EXPIRY_WARNING_DAYS } from "./expiry.ts";

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
    /** Optional OS action category (e.g. the "✓ Used / Snooze" set). */
    categoryId?: string;
    /** Optional payload the response handler reads (e.g. { itemId }). */
    data?: Record<string, unknown>;
  }): Promise<void>;
}

const MS_PER_DAY = 86_400_000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Local-time hour of day the digest aims for. */
export const NOTIFY_LOCAL_HOUR = 9;

/**
 * iOS pending-local-notification budget. Digests are capped to this count,
 * soonest trigger dates first.
 */
export const MAX_SCHEDULE_INTENTS = 64;

/** Urgency tier for a digest, taken from its SOONEST-expiring item. */
export type DigestTier = "today" | "tomorrow" | "soon";

/** One item inside a day-digest. */
export interface DigestItem {
  id: string;
  name: string;
  /** Calendar days from the trigger to this item's expiry. >= 0. */
  daysUntilExpiry: number;
}

/**
 * A single morning's digest — all items that would enter (or are already in)
 * the warning zone and fire that local day, bundled into one notification.
 */
export interface DigestIntent {
  /** Stable id per trigger day: `digest-YYYY-MM-DD` (local calendar day). */
  id: string;
  triggerDate: Date;
  /** Items in the digest, SOONEST-expiring first. `items[0]` is the lead. */
  items: DigestItem[];
  /** Min daysUntilExpiry across the group (0 = something expires today). */
  minDaysUntilExpiry: number;
  /** Tier derived from minDaysUntilExpiry — drives the copy bank. */
  tier: DigestTier;
}

function tierFor(minDays: number): DigestTier {
  if (minDays <= 0) return "today";
  if (minDays === 1) return "tomorrow";
  return "soon";
}

/** Local-calendar-day key (YYYY-MM-DD in the runtime timezone). */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The per-item trigger moment (before grouping):
 *  - "warning zone start" = expiresAt - warningDays days
 *  - if warningStart is in the future → 09:00 LOCAL on warningStart's day
 *    (or now + 5m if that pin has already passed today), and
 *  - if warningStart is already here → now + 5m, so the reminder fires shortly
 *    after open instead of as a jarring immediate popup.
 */
function itemTrigger(expiryMs: number, nowMs: number, warningDays: number): Date {
  const warningStartMs = expiryMs - warningDays * MS_PER_DAY;
  if (warningStartMs > nowMs) {
    const t = new Date(warningStartMs);
    t.setHours(NOTIFY_LOCAL_HOUR, 0, 0, 0);
    return t.getTime() > nowMs ? t : new Date(nowMs + FIVE_MINUTES_MS);
  }
  return new Date(nowMs + FIVE_MINUTES_MS);
}

/**
 * Compute the day-digest intents for a list of items at a given moment.
 *
 * Skipped (never contribute to a digest):
 *  - items with no expiresAt
 *  - items with an unparseable expiresAt
 *  - items already expired (expiresAt <= now): in-app red text is the signal;
 *    we don't nag after the fact.
 *
 * Everything else is assigned its per-item trigger, then items sharing a local
 * trigger DAY are bundled into one DigestIntent (soonest-expiring item first).
 *
 * Output is capped at maxIntents (default = the iOS 64-pending limit). When the
 * cap bites, the soonest-firing digests are kept.
 */
export function computeDigestIntents(
  items: Array<{ id: string; name: string; expiresAt?: string }>,
  now: Date,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
  maxIntents: number = MAX_SCHEDULE_INTENTS,
): DigestIntent[] {
  const nowMs = now.getTime();

  // Bucket items by the local day they'd fire.
  const byDay = new Map<
    string,
    { triggerMs: number; items: DigestItem[] }
  >();

  for (const item of items) {
    if (!item.expiresAt) continue;
    const expiryMs = new Date(item.expiresAt).getTime();
    if (Number.isNaN(expiryMs)) continue;
    if (expiryMs <= nowMs) continue;

    const trigger = itemTrigger(expiryMs, nowMs, warningDays);
    const daysUntilExpiry = Math.max(
      0,
      Math.round((expiryMs - trigger.getTime()) / MS_PER_DAY),
    );
    const key = localDayKey(trigger);

    const bucket = byDay.get(key);
    const entry: DigestItem = { id: item.id, name: item.name, daysUntilExpiry };
    if (bucket) {
      bucket.items.push(entry);
      // The digest fires at the earliest trigger among its members.
      if (trigger.getTime() < bucket.triggerMs) bucket.triggerMs = trigger.getTime();
    } else {
      byDay.set(key, { triggerMs: trigger.getTime(), items: [entry] });
    }
  }

  const digests: DigestIntent[] = [];
  for (const [key, bucket] of byDay) {
    // Soonest-expiring first — that item becomes the digest's lead voice.
    const sorted = [...bucket.items].sort(
      (a, b) => a.daysUntilExpiry - b.daysUntilExpiry,
    );
    const lead = sorted[0];
    if (!lead) continue; // unreachable: a bucket only exists with ≥1 item
    const minDaysUntilExpiry = lead.daysUntilExpiry;
    digests.push({
      id: `digest-${key}`,
      triggerDate: new Date(bucket.triggerMs),
      items: sorted,
      minDaysUntilExpiry,
      tier: tierFor(minDaysUntilExpiry),
    });
  }

  digests.sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime());
  return digests.length <= maxIntents ? digests : digests.slice(0, maxIntents);
}
