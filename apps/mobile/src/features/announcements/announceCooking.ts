/**
 * Writes a cooking announcement AND an activity_events row (so "I'm making X"
 * shows in History). PowerSync + upload-proxy fan out the pushes.
 */
import * as Crypto from 'expo-crypto';

import { getPowerSync } from '../../data/powersync/db';
import { recordActivity } from '../activity/recordActivity';

export async function announceCooking(opts: {
  householdId: string;
  userId: string;
  recipeId: string;
  recipeTitle: string;
  image?: string | null;
}): Promise<string> {
  const db = getPowerSync();
  const id = Crypto.randomUUID();
  const now = new Date();
  await db.execute(
    `INSERT INTO announcements
       (id, household_id, kind, created_by, created_at, status, recipe_id, recipe_title, image, updated_at, deleted)
     VALUES (?, ?, 'cooking', ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      id,
      opts.householdId,
      opts.userId,
      now.toISOString(),
      opts.recipeId,
      opts.recipeTitle,
      opts.image ?? null,
      Date.now(),
      0,
    ],
  );
  await recordActivity({
    householdId: opts.householdId,
    userId: opts.userId,
    kind: 'cooked',
    label: opts.recipeTitle,
    refId: opts.recipeId,
    image: opts.image ?? null,
  });
  return id;
}
