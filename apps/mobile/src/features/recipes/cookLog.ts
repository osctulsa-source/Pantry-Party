/**
 * cookLog — cook events, now SYNCED (Favorites/History arc, PR 3).
 *
 * Was an on-device AsyncStorage log (cap 100); it is now a thin adapter over
 * the synced activity_events log (recordActivity). The public API
 * (recordCookEvent / readCookEvents) is unchanged, so every existing call site
 * — CookedItSheet (writes) and the streak readers (useInsights,
 * useExpiryNotifications) — keeps working while moving from per-device storage
 * to household-shared, reinstall-durable data.
 *
 * recordCookEvent has no userId (its callers don't have one handy), so it reads
 * the current Supabase session id for the activity row's tenancy; signed-out =
 * skip (best-effort, never break the cook flow).
 */
import { currentUserId, readActivityEvents, recordActivity } from '../activity/recordActivity';

export interface CookEvent {
  recipeId: number;
  recipeTitle: string;
  /** ISO timestamp of the confirmation. */
  cookedAt: string;
  /** How many pantry items the user marked used/decremented. */
  itemsUsed: number;
}

export async function recordCookEvent(
  householdId: string | null,
  event: CookEvent,
): Promise<void> {
  if (!householdId) return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    await recordActivity({
      householdId,
      userId,
      kind: 'cooked',
      label: event.recipeTitle,
      refId: String(event.recipeId),
      quantity: event.itemsUsed,
      occurredAt: event.cookedAt,
    });
  } catch {
    // Best-effort log — never let bookkeeping break the cook flow.
  }
}

export async function readCookEvents(householdId: string | null): Promise<CookEvent[]> {
  const events = await readActivityEvents(householdId);
  return events
    .filter((e) => e.kind === 'cooked')
    .map((e) => ({
      recipeId: e.refId ? Number(e.refId) : 0,
      recipeTitle: e.label,
      cookedAt: e.occurredAt,
      itemsUsed: e.quantity ?? 0,
    }));
}
