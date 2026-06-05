/**
 * Idempotently provisions a default household + owner membership for the
 * signed-in user if they don't have one yet.
 *
 * Designed to run AFTER `PowerSyncDatabase.waitForFirstSync()` completes for
 * the current session, so the local `user_households` table reflects server
 * state before we decide whether to create. Without that ordering, a returning
 * user whose membership exists server-side but hasn't replicated to this device
 * yet would get a duplicate household.
 */
import * as Crypto from 'expo-crypto';
import { getPowerSync } from '../../data/powersync/db';

const DEFAULT_HOUSEHOLD_NAME = 'My Pantry';
const OWNER_ROLE = 'owner';

// Module-level map of in-flight ensureDefaultHousehold invocations per user.
//
// Why this exists: the original SELECT-then-INSERT pattern had a check-then-act race —
// concurrent calls for the same user (hot-reloads, repeated onAuthStateChange) all
// observed an empty user_households state and all proceeded to INSERT, producing
// duplicate households. See project doc Notes (2026-06-05) for the full incident
// writeup and the deferred architectural fix (move auto-create to backend trigger).
//
// This guard solves the intra-bundle race. Hot-reload races (where Metro replaces
// the JS bundle mid-flight) are NOT solved here — those are a dev-only artifact
// handled by the dedup SQL until the backend-side fix lands.
const inFlightEnsures = new Map<string, Promise<void>>();

export async function ensureDefaultHousehold(userId: string): Promise<void> {
  const existing = inFlightEnsures.get(userId);
  if (existing) {
    return existing; // Concurrent call for same user — share the in-flight Promise
  }

  const promise = (async () => {
    try {
      const db = getPowerSync();

      const existing = await db.getAll<{ count: number }>(
        'SELECT COUNT(*) AS count FROM user_households WHERE user_id = ?',
        [userId],
      );
      if ((existing[0]?.count ?? 0) > 0) return;

      const householdId = Crypto.randomUUID();
      const membershipId = Crypto.randomUUID();
      const nowIso = new Date().toISOString();

      // Atomic: never leave a household with no membership (or vice versa).
      // PowerSync's CRUD queue captures both inserts; uploadData() drains them
      // to /sync/upload (PR #9 — services/api Express stopgap, ADR-008).
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO households (id, name, created_at, created_by)
       VALUES (?, ?, ?, ?)`,
          [householdId, DEFAULT_HOUSEHOLD_NAME, nowIso, userId],
        );
        await tx.execute(
          `INSERT INTO user_households (id, user_id, household_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
          [membershipId, userId, householdId, OWNER_ROLE, nowIso],
        );
      });
    } finally {
      inFlightEnsures.delete(userId); // Cleanup regardless of success/error
    }
  })();

  inFlightEnsures.set(userId, promise);
  return promise;
}
