/**
 * useExpiryNotifications — reconciles local notifications with the current pantry list.
 *
 * Digest model (July 2026 redesign): instead of one notification per expiring
 * item, core groups items by the morning they'd fire and emits ONE playful
 * digest per day ("3 things are getting close — spinach leads"). Copy comes
 * from the phrase bank in core (deterministic, seeded off the trigger day) so
 * the reconcile stays idempotent.
 *
 * Idempotency comes from the cancelAll() + schedule-all pattern: each call
 * computes the same digests from the same items + now, and the OS notification
 * store is wiped before re-population, so re-running yields the same set — same
 * wording included.
 *
 * Reconcile triggers:
 *   - items array changes (add/remove/edit pantry item)
 *   - app foregrounded (so a long-backgrounded app picks up newly-due warnings)
 *
 * Notification actions ("✓ Used" / "Snooze 2 days") are registered once at
 * mount and handled in notificationActions.ts. They ride on SINGLE-item digests
 * (a bundle can't act on one item) — resolving from the lock screen uses the
 * same write paths as the in-app buttons, and the resulting items change
 * re-triggers this reconciler automatically.
 *
 * Streak: when the streak is ≥3 and the digest is urgent (today/tomorrow), the
 * copy folds the streak in ("save 2 things, save your 7-day streak") — no extra
 * notification, keeping the one-nudge-a-morning promise.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  computeDigestIntents,
  digestNotification,
  computeInsights,
  type PantryItem,
} from '@breadbox/core';

import { expoScheduler, ensureNotificationPermission } from './expoScheduler';
import { getNotifyHour } from './notificationPrefs';
import {
  EXPIRY_CATEGORY,
  handleExpiryActionResponse,
  registerExpiryCategory,
} from './notificationActions';
import { readExpiryEvents } from '../pantry/expiryEvents';
import { tokens } from '../../theme/tokens';
import { readCookEvents } from '../recipes/cookLog';

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
    lightColor: tokens.color.accent, // Crumb accent (Android channel LED)
  });
}

async function reconcile(
  items: PantryItem[],
  householdId: string | null,
): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const now = new Date();

  // Current streak (best-effort) — folds into the digest copy on urgent tiers.
  // Reads the on-device event logs (fast, AsyncStorage); the reconciler already
  // runs on every items-change and foreground, so it stays fresh.
  let streakDays = 0;
  if (householdId) {
    try {
      const [expiryEvents, cookEvents] = await Promise.all([
        readExpiryEvents(householdId),
        readCookEvents(householdId),
      ]);
      streakDays = computeInsights(expiryEvents, cookEvents, now).streakDays;
    } catch {
      // Streak is optional flavour — never break the digest flow.
    }
  }

  // Reminder-time preference (Settings → Reminders); defaults to 9am.
  const notifyHour = await getNotifyHour();

  const digests = computeDigestIntents(items, now, undefined, undefined, notifyHour);
  await expoScheduler.cancelAll();
  for (const digest of digests) {
    const { title, body } = digestNotification(digest, streakDays);
    const leadItem = digest.items[0];
    const single = digest.items.length === 1 && leadItem !== undefined;
    await expoScheduler.schedule({
      id: digest.id,
      title,
      body,
      triggerDate: digest.triggerDate,
      // One-item digests carry the ✓ Used / Snooze actions (they resolve the
      // single item); bundles carry none and just open the app on tap.
      categoryId: single ? EXPIRY_CATEGORY : undefined,
      data: single && leadItem ? { itemId: leadItem.id } : { screen: 'expiring' },
    });
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
