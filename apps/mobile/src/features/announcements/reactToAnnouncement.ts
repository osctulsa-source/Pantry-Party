/** Upserts the caller's reaction to an announcement (one row per user/ann). */
import * as Crypto from 'expo-crypto';
import type { Reaction } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export async function reactToAnnouncement(opts: {
  announcementId: string;
  householdId: string;
  userId: string;
  reaction: Reaction;
}): Promise<void> {
  const db = getPowerSync();
  const existing = await db.getAll<{ id: string }>(
    'SELECT id FROM announcement_reactions WHERE announcement_id = ? AND user_id = ? LIMIT 1',
    [opts.announcementId, opts.userId],
  );
  const now = Date.now();
  if (existing.length > 0 && existing[0]) {
    await db.execute(
      'UPDATE announcement_reactions SET reaction = ?, deleted = 0, updated_at = ? WHERE id = ?',
      [opts.reaction, now, existing[0].id],
    );
    return;
  }
  await db.execute(
    `INSERT INTO announcement_reactions
       (id, announcement_id, household_id, user_id, reaction, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      opts.announcementId,
      opts.householdId,
      opts.userId,
      opts.reaction,
      new Date().toISOString(),
      now,
      0,
    ],
  );
}
