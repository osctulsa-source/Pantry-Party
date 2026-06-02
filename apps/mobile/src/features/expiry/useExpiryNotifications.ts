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
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { computeScheduleIntents, type PantryItem } from '@breadbox/core';

import { expoScheduler, ensureNotificationPermission } from './expoScheduler';

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
