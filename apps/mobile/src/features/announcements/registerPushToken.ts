/**
 * Obtains the Expo push token after notification permission is granted and
 * upserts it into the user-scoped push_tokens table (drains via upload-proxy).
 * Idempotent on the token's uniqueness — re-running refreshes updated_at.
 */
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getPowerSync } from '../../data/powersync/db';
import { ensureNotificationPermission } from '../expiry/expoScheduler';

export async function registerPushToken(userId: string): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;
  if (!token) return;

  const db = getPowerSync();
  const existing = await db.getAll<{ id: string }>(
    'SELECT id FROM push_tokens WHERE token = ? AND deleted = 0 LIMIT 1',
    [token],
  );
  const now = Date.now();
  if (existing.length > 0 && existing[0]) {
    await db.execute('UPDATE push_tokens SET updated_at = ? WHERE id = ?', [now, existing[0].id]);
    return;
  }
  await db.execute(
    `INSERT INTO push_tokens
       (id, user_id, token, platform, announcements_enabled, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Crypto.randomUUID(), userId, token, Platform.OS, 1, now, 0],
  );
}
