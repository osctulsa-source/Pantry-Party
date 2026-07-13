/**
 * Lock-screen actions for expiry notifications — "✓ Used" / "Snooze 2 days".
 * One tap from notification to resolution, no app navigation required
 * (external review §3.4: resolving a notification used to take open → find →
 * edit → change date).
 *
 * The category is registered at hook mount (runtime API — no rebuild needed).
 * Responses read the item row for its household (the listener has no React
 * context) and then ride the SAME write paths as the in-app actions:
 * Used → tombstone + rescue event; Snooze → expires_at = today + 2 (matching
 * ExpiringSoonScreen's semantics). The pantry's reactive query picks up the
 * change and the reconciler reschedules around it.
 *
 * Body tap (DEFAULT_ACTION) opens Cook with use-it-up focus via navigationRef.
 *
 * Killed-app caveat (accepted): with opensAppToForeground: false the system
 * delivers the action without opening the app; if the JS process isn't
 * running, expo-notifications surfaces the response on next launch via
 * getLastNotificationResponseAsync — the hook checks it, so the action lands
 * late rather than never. The duplicate-guard keys on (notification id,
 * action) because a cold-start response can ALSO replay through the live
 * listener.
 */
import * as Notifications from 'expo-notifications';
import { addDaysUTC } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';
import { navigateWhenReady } from '../../navigation/navigationRef';
import { recordExpiryEvents } from '../pantry/expiryEvents';

export const EXPIRY_CATEGORY = 'expiry';
const ACTION_USED = 'used';
const ACTION_SNOOZE = 'snooze';

export async function registerExpiryCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(EXPIRY_CATEGORY, [
    {
      identifier: ACTION_USED,
      buttonTitle: '✓ Used',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: 'Snooze 2 days',
      options: { opensAppToForeground: false },
    },
  ]);
}

const handledResponses = new Set<string>();

export async function handleExpiryActionResponse(
  response: Notifications.NotificationResponse,
): Promise<void> {
  const action = response.actionIdentifier;
  const data = response.notification.request.content.data as {
    itemId?: string;
    screen?: string;
  } | null;

  // Default tap on an expiry digest: land the user on the "Use soon" list —
  // the notification said "3 things need you"; the app should open ON those
  // three things, not wherever it was last left. (Single-item digests carry
  // itemId + actions; their default tap goes to the same list for one calm,
  // consistent destination.) Same dup-guard as the actions: a cold-start
  // response replays through both the live listener and last-response.
  if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    if (data?.screen === 'expiring' || data?.itemId) {
      const dupKey = `${response.notification.request.identifier}:open`;
      if (handledResponses.has(dupKey)) return;
      handledResponses.add(dupKey);
      navigateWhenReady('ExpiringSoon');
    }
    return;
  }

  if (action !== ACTION_USED && action !== ACTION_SNOOZE) return;

  const itemId = data?.itemId ?? response.notification.request.identifier;
  if (!itemId) return;

  const dupKey = `${response.notification.request.identifier}:${action}`;
  if (handledResponses.has(dupKey)) return;
  handledResponses.add(dupKey);

  try {
    const db = getPowerSync();
    const rows = await db.getAll<{ household_id: string; name: string; deleted: number }>(
      'SELECT household_id, name, deleted FROM pantry_items WHERE id = ? LIMIT 1',
      [itemId],
    );
    const row = rows[0];
    if (!row || row.deleted === 1) return; // already resolved elsewhere

    if (action === ACTION_USED) {
      // Tombstone — identical to the in-app Used path.
      await db.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [
        Date.now(),
        itemId,
      ]);
      await recordExpiryEvents(row.household_id, [
        { kind: 'used', itemName: row.name, at: new Date().toISOString() },
      ]);
    } else {
      await db.execute('UPDATE pantry_items SET expires_at = ?, updated_at = ? WHERE id = ?', [
        addDaysUTC(new Date(), 2).toISOString(),
        Date.now(),
        itemId,
      ]);
    }
  } catch (err) {
    console.warn('[expiry] notification action failed', err);
  }
}
