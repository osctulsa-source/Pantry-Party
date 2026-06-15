/**
 * useExpiryNotifications — reconciles local notifications with the current pantry list.
 *
 * Idempotency comes from the cancelAll() + schedule-all pattern in core's reconciler:
 * each call computes the same intents from the same items + now, and the OS notification
 * store is wiped before re-population, so re-running yields the same scheduled set.
 *
 * Reconcile triggers:
 *   - items array changes (add/remove/edit pantry item)
 *   - app foregrounded (so a long-backgrounded app picks up newly-due warnings)
 *
 * Notification actions ("✓ Used" / "Snooze 2 days") are registered once at
 * mount and handled in notificationActions.ts — resolving from the lock
 * screen rides the same write paths as the in-app buttons, and the resulting
 * items change re-triggers this reconciler automatically.
 *
 * Streak-saver (PR 3 of the streak arc): when the streak is ≥3 and a
 * warning-zone item exists, an extra notification carries a personalised
 * nudge ("Your 7-day streak is on the line — use or freeze your Chicken
 * before tomorrow"). Occupies one slot in the 64-intent budget.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  computeScheduleIntents,
  computeStreakSaverIntent,
  streakSaverBody,
  type PantryItem,
} from '@breadbox/core';

import { expoScheduler, ensureNotificationPermission } from './expoScheduler';
import { handleExpiryActionResponse, registerExpiryCategory } from './notificationActions';
import { readExpiryEvents } from '../pantry/expiryEvents';
import { readCookEvents } from '../recipes/cookLog';
import { computeInsights } from '@breadbox/core';

const NOTIFICATION_TITLE = 'Pantry';
const STREAK_TITLE = 'Streak alert';

function bodyFor(itemName: string, days: number): string {
  if (days >= 2) return `${itemName} expires in ${days} days`;
  if (days === 1) return `${itemName} expires tomorrow`;
  return `${itemName} expires today`;
}

/**
 * Android 8+ requires a notification channel; without one, notifications
 * land in an auto-created "Miscellaneous" channel. iOS ignores this call.
 * Named once at mount — subsequent calls with the same id are no-ops.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Expiry reminders',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#2E5D3A', // Crumb accent
  });
}

async function reconcile(
  items: PantryItem[],
  householdId: string | null,
): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const now = new Date();

  // Regular expiry intents (budget: 63 slots — reserve 1 for streak-saver).
  const intents = computeScheduleIntents(items, now);
  await expoScheduler.cancelAll();
  for (const intent of intents) {
    await expoScheduler.schedule({
      id: intent.itemId,
      title: NOTIFICATION_TITLE,
      body: bodyFor(intent.itemName, intent.daysUntilExpiry),
      triggerDate: intent.triggerDate,
    });
  }

  // Streak-saver: one extra notification when the streak ≥3 and a
  // warning-zone item exists. Reads the on-device event logs (fast,
  // AsyncStorage) to compute the current streak inline — the reconciler
  // already runs on every items-change and foreground, so it's always fresh.
  if (householdId) {
    try {
      const [expiryEvents, cookEvents] = await Promise.all([
        readExpiryEvents(householdId),
        readCookEvents(householdId),
      ]);
      const { streakDays } = computeInsights(expiryEvents, cookEvents, now);
      const saver = computeStreakSaverIntent(streakDays, items, now);
      if (saver) {
        await expoScheduler.schedule({
          id: saver.id,
          title: STREAK_TITLE,
          body: streakSaverBody(saver),
          triggerDate: saver.triggerDate,
        });
      }
    } catch {
      // Streak-saver is best-effort — never break the regular notification flow.
    }
  }
}

export function useExpiryNotifications(
  items: PantryItem[],
  householdId?: string | null,
): void {
  // One-time: register the action category + listen for action taps.
  useEffect(() => {
    ensureAndroidChannel().catch((err) =>
      console.warn('[expiry] android channel setup failed', err),
    );
    registerExpiryCategory().catch((err) =>
      console.warn('[expiry] category registration failed', err),
    );
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleExpiryActionResponse(response);
    });
    // A response that launched the app (the process was dead when the user
    // tapped the action) is only available via the last-response API — the
    // dup-guard inside the handler makes the overlap with the live listener safe.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) void handleExpiryActionResponse(response);
      })
      .catch(() => {});
    return () => sub.remove();
  }, []);

  const hid = householdId ?? null;

  useEffect(() => {
    reconcile(items, hid).catch((err) =>
      console.warn('[expiry] reconcile failed', err),
    );
  }, [items, hid]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconcile(items, hid).catch((err) =>
          console.warn('[expiry] reconcile on foreground failed', err),
        );
      }
    });
    return () => sub.remove();
  }, [items, hid]);
}
