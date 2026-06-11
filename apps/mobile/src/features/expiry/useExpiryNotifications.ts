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
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { computeScheduleIntents, type PantryItem } from '@breadbox/core';

import { expoScheduler, ensureNotificationPermission } from './expoScheduler';
import { handleExpiryActionResponse, registerExpiryCategory } from './notificationActions';

const NOTIFICATION_TITLE = 'Pantry';

function bodyFor(itemName: string, days: number): string {
  if (days >= 2) return `${itemName} expires in ${days} days`;
  if (days === 1) return `${itemName} expires tomorrow`;
  return `${itemName} expires today`;
}

async function reconcile(items: PantryItem[]): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const intents = computeScheduleIntents(items, new Date());
  await expoScheduler.cancelAll();
  for (const intent of intents) {
    await expoScheduler.schedule({
      id: intent.itemId,
      title: NOTIFICATION_TITLE,
      body: bodyFor(intent.itemName, intent.daysUntilExpiry),
      triggerDate: intent.triggerDate,
    });
  }
}

export function useExpiryNotifications(items: PantryItem[]): void {
  // One-time: register the action category + listen for action taps.
  useEffect(() => {
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

  useEffect(() => {
    reconcile(items).catch((err) =>
      console.warn('[expiry] reconcile failed', err),
    );
  }, [items]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconcile(items).catch((err) =>
          console.warn('[expiry] reconcile on foreground failed', err),
        );
      }
    });
    return () => sub.remove();
  }, [items]);
}
