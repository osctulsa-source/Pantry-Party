/**
 * recordActivity — the single synced writer for the household activity log
 * (History feature, PR 3 of the Favorites/History arc).
 *
 * INSERTs an activity_events row through PowerSync's CRUD queue (drained to
 * Postgres by the upload-proxy PUT path; tenancy requires added_by === the JWT
 * sub, so callers pass the current user id). This is the canonical writer: the
 * cook/used/tossed adapters (cookLog, expiryEvents) and the restock site
 * (ShoppingScreen) all funnel through here. It retires the capped on-device
 * AsyncStorage logs (cookLog 100 / expiryEvents 200) in favour of synced,
 * household-shared, reinstall-durable storage.
 */
import * as Crypto from 'expo-crypto';
import type { ActivityEvent, ActivityKind } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';
import { rowToActivityEvent } from '../../data/powersync/mapActivityRow';
import type { ActivityEventRow } from '../../data/powersync/schema';
import { supabase } from '../../data/supabase/client';

export interface RecordActivityInput {
  householdId: string;
  userId: string;
  kind: ActivityKind;
  label: string;
  refId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  image?: string | null;
  meta?: string | null;
  /** ISO timestamp of the event; defaults to now. */
  occurredAt?: string;
}

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const db = getPowerSync();
  await db.execute(
    `INSERT INTO activity_events
       (id, household_id, kind, ref_id, label, quantity, unit, image, meta, occurred_at, added_by, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      input.householdId,
      input.kind,
      input.refId ?? null,
      input.label,
      input.quantity ?? null,
      input.unit ?? null,
      input.image ?? null,
      input.meta ?? null,
      input.occurredAt ?? new Date().toISOString(),
      input.userId,
      Date.now(),
      0,
    ],
  );
}

/**
 * Current Supabase user id, for write-sites without React context: the
 * cook/expiry adapters and the background notification-action handler. Returns
 * null when signed out (callers skip the log — best-effort, never throw).
 */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Validate rows through core, skipping any malformed row rather than dropping
 *  the whole log if one is bad. */
export function mapActivityRows(rows: ActivityEventRow[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const r of rows) {
    try {
      out.push(rowToActivityEvent(r));
    } catch {
      // skip a malformed row
    }
  }
  return out;
}

/**
 * One-shot read of the household's activity log (newest first), for the
 * non-reactive consumers (insights summary, the notification reconciler).
 */
export async function readActivityEvents(householdId: string | null): Promise<ActivityEvent[]> {
  if (!householdId) return [];
  try {
    const rows = await getPowerSync().getAll<ActivityEventRow>(
      'SELECT * FROM activity_events WHERE deleted = 0 AND household_id = ? ORDER BY occurred_at DESC',
      [householdId],
    );
    return mapActivityRows(rows);
  } catch {
    return [];
  }
}
