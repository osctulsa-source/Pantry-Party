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
 * Android: notifications on 8+ require a CHANNEL or the system falls back to
 * an auto-created "Miscellaneous" one the user can't recognize. We configure
 * the 'default' channel (which expo-notifications routes channel-less
 * notifications to) once at mount — named, high-importance, Crumb-accented.
 * iOS ignores channels entirely.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { computeScheduleIntents, type PantryItem } from '@breadbox/core';

import { expoScheduler, ensureNotificationPermission } from './expoScheduler';
import { handleExpiryActionResponse, registerExpiryCategory } from './notificationActions';

const NOTIFICATION_TITLE = 'Pantry';

/**
 * Android 8+ notification channel. Configures the 'default' channel that
 * expo-notifications uses for notifications scheduled without an explicit
 * channelId — so the scheduler stays untouched. Color matches the
 * expo-notifications plugin accent in app.config.js (brand-stable literal,
 * not the theme token, because channels are system-level and outlive the
 * app's light/dark choice).
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Expiry reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200],
    lightColor: '#2E5D3A',
  });
}

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
  // One-time: Android channel + action category + action-tap listener.
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
