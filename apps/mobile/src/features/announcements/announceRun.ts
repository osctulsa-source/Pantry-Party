/**
 * Writes a shopping_run announcement row locally; PowerSync + the upload-proxy
 * fan out the pushes. Returns the new announcement id so callers can stamp
 * subsequent list adds with run_id.
 */
import * as Crypto from 'expo-crypto';
import { windowToDepartsAt, type RunWindowId } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export async function announceRun(opts: {
  householdId: string;
  userId: string;
  window: RunWindowId;
  message?: string;
}): Promise<string> {
  const db = getPowerSync();
  const id = Crypto.randomUUID();
  const now = new Date();
  await db.execute(
    `INSERT INTO announcements
       (id, household_id, kind, created_by, created_at, status, departs_at, message, updated_at, deleted)
     VALUES (?, ?, 'shopping_run', ?, ?, 'active', ?, ?, ?, ?)`,
    [
      id,
      opts.householdId,
      opts.userId,
      now.toISOString(),
      windowToDepartsAt(opts.window, now),
      opts.message ?? null,
      Date.now(),
      0,
    ],
  );
  return id;
}

/** The household's currently-active shopping run, if any (soonest first). */
export async function activeRunId(householdId: string): Promise<string | null> {
  const db = getPowerSync();
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM announcements
     WHERE household_id = ? AND kind = 'shopping_run' AND status = 'active' AND deleted = 0
     ORDER BY created_at DESC LIMIT 1`,
    [householdId],
  );
  return rows[0]?.id ?? null;
}
