/**
 * expiryEvents — used/tossed outcomes, now SYNCED (Favorites/History arc, PR 3).
 *
 * Was an on-device AsyncStorage log (cap 200); it is now a thin adapter over
 * the synced activity_events log (recordActivity). The public API
 * (recordExpiryEvents / readExpiryEvents) is unchanged, so every call site —
 * ExpiringSoonScreen, PantryScreen (swipe + multi-select), the lock-screen
 * notification handler (writes), and the streak readers — keeps working while
 * moving to household-shared, reinstall-durable data.
 *
 * recordExpiryEvents reads the current Supabase session id for the activity
 * row's tenancy (its callers, incl. the background notification handler, don't
 * pass one); signed-out = skip (best-effort, never break the action).
 */
import { currentUserId, readActivityEvents, recordActivity } from '../activity/recordActivity';

export type ExpiryEventKind = 'used' | 'tossed';

export interface ExpiryEvent {
  kind: ExpiryEventKind;
  itemName: string;
  /** ISO timestamp of the action. */
  at: string;
}

export async function recordExpiryEvents(
  householdId: string | null,
  events: ExpiryEvent[],
): Promise<void> {
  if (!householdId || events.length === 0) return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    for (const e of events) {
      await recordActivity({
        householdId,
        userId,
        kind: e.kind,
        label: e.itemName,
        occurredAt: e.at,
      });
    }
  } catch {
    // Best-effort log — never let bookkeeping break the action.
  }
}

export async function readExpiryEvents(householdId: string | null): Promise<ExpiryEvent[]> {
  const events = await readActivityEvents(householdId);
  return events
    .filter((e) => e.kind === 'used' || e.kind === 'tossed')
    .map((e) => ({ kind: e.kind as ExpiryEventKind, itemName: e.label, at: e.occurredAt }));
}
