/**
 * Mobile-side adapter for the @breadbox/core NotificationScheduler interface.
 * Wraps expo-notifications. The pure reconciler in core knows nothing about Expo.
 */
import * as Notifications from 'expo-notifications';
import type { NotificationScheduler } from '@breadbox/core';

export const expoScheduler: NotificationScheduler = {
  async cancelAll() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
  async schedule({ id, title, body, triggerDate, categoryId, data }) {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title,
        body,
        // A single-item digest passes the EXPIRY category (its "✓ Used /
        // Snooze" actions resolve against data.itemId); a bundle passes none,
        // so a default tap just opens the app.
        ...(categoryId ? { categoryIdentifier: categoryId } : {}),
        data: data ?? {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
  },
};

/**
 * Read-only permission check: never shows the system prompt. Use this on
 * paths that run without the user asking for anything (app launch, sign-in).
 */
export async function hasNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  return existing.status === 'granted';
}

/**
 * Idempotent permission check that may show the system prompt. Call it only
 * when there is something concrete to notify about, so the prompt has context. Returns true if granted (or already granted),
 * false otherwise. Caller should silently skip scheduling on false — we don't
 * want to crash or repeat-prompt the user.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (await hasNotificationPermission()) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}
