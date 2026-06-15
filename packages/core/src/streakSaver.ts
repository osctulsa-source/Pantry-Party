/**
 * streakSaver — streak-aware notification intent (pure, no I/O).
 *
 * When the user has a streak of ≥3 days AND at least one item is in the
 * warning zone (expires within warningDays), this produces a single extra
 * ScheduleIntent with a streak-personalised body:
 *
 *   "Your 7-day streak is on the line — use or freeze your Chicken
 *    before tomorrow."
 *
 * The intent triggers at 09:00 local on the SOONEST expiring item's warning
 * start (same pin logic as the regular reconciler) — it's a nudge to ACT
 * before the expiry causes a waste event that would break the streak.
 *
 * Returns null when the streak is <3, no warning-zone items exist, or all
 * are already expired. The mobile-side hook schedules this alongside the
 * regular intents (it occupies one of the 64-intent budget slots).
 *
 * Separated from streakStats so the notification layer doesn't pull in the
 * full insights computation; the streak count is passed in pre-computed.
 */

import { DEFAULT_EXPIRY_WARNING_DAYS } from './expiry.ts';

export interface StreakSaverIntent {
  /** Synthetic id — stable across reconciles for the same soonest item. */
  id: string;
  itemName: string;
  streakDays: number;
  triggerDate: Date;
  daysUntilExpiry: number;
}

const MS_PER_DAY = 86_400_000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const NOTIFY_LOCAL_HOUR = 9;
const MIN_STREAK_FOR_NUDGE = 3;

/**
 * Compute an optional streak-saver intent.
 *
 * @param streakDays  The current streak (from computeInsights).
 * @param items       The pantry items (same shape the regular reconciler takes).
 * @param now         The clock anchor.
 * @param warningDays How many days before expiry the warning zone starts.
 */
export function computeStreakSaverIntent(
  streakDays: number,
  items: Array<{ id: string; name: string; expiresAt?: string }>,
  now: Date,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
): StreakSaverIntent | null {
  if (streakDays < MIN_STREAK_FOR_NUDGE) return null;

  const nowMs = now.getTime();

  // Find the soonest-expiring item that's in the warning zone but NOT yet
  // expired — the one most likely to cause a streak break if ignored.
  let soonest: { id: string; name: string; expiryMs: number } | null = null;
  for (const item of items) {
    if (!item.expiresAt) continue;
    const expiryMs = new Date(item.expiresAt).getTime();
    if (Number.isNaN(expiryMs)) continue;
    if (expiryMs <= nowMs) continue; // already expired — too late to save
    const warningStartMs = expiryMs - warningDays * MS_PER_DAY;
    if (warningStartMs > nowMs) continue; // not yet in the warning zone
    if (!soonest || expiryMs < soonest.expiryMs) {
      soonest = { id: item.id, name: item.name, expiryMs };
    }
  }

  if (!soonest) return null;

  // Trigger pin: 09:00 local tomorrow if it's past 9am today, otherwise
  // 09:00 today — the nudge should feel like a morning reminder, not an
  // immediate popup. Fall back to now+5m if the pin is in the past.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(NOTIFY_LOCAL_HOUR, 0, 0, 0);
  const todayPin = new Date(now);
  todayPin.setHours(NOTIFY_LOCAL_HOUR, 0, 0, 0);
  let triggerDate = todayPin.getTime() > nowMs ? todayPin : tomorrow;
  if (triggerDate.getTime() <= nowMs) {
    triggerDate = new Date(nowMs + FIVE_MINUTES_MS);
  }

  const daysUntilExpiry = Math.max(
    0,
    Math.round((soonest.expiryMs - triggerDate.getTime()) / MS_PER_DAY),
  );

  return {
    id: `streak-saver-${soonest.id}`,
    itemName: soonest.name,
    streakDays,
    triggerDate,
    daysUntilExpiry,
  };
}

/** Build the notification body string from a streak-saver intent. */
export function streakSaverBody(intent: StreakSaverIntent): string {
  const timeframe =
    intent.daysUntilExpiry === 0
      ? 'today'
      : intent.daysUntilExpiry === 1
        ? 'before tomorrow'
        : `in the next ${intent.daysUntilExpiry} days`;
  return `Your ${intent.streakDays}-day streak is on the line — use or freeze your ${intent.itemName} ${timeframe}.`;
}
