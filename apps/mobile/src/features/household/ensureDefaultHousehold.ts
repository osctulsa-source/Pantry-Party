/**
 * Idempotently provisions a default household + owner membership for the
 * signed-in user if they don't have one yet.
 *
 * Designed to run AFTER `PowerSyncDatabase.waitForFirstSync()` completes for
 * the current session, so the local `user_households` table reflects server
 * state before we decide whether to create. Without that ordering, a returning
 * user whose membership exists server-side but hasn't replicated to this device
 * yet would get a duplicate household.
 *
 * Caveat (single-device only):
 *   `SupabaseConnector.uploadData()` is still a no-op (deferred to PR #8 with
 *   the Add Item UI). The locally-inserted rows here are visible to local
 *   SQLite queries — so the PantryScreen and pantry CRUD work — but they do
 *   NOT reach Postgres until uploadData lands. Two devices for the same user
 *   will each auto-create their OWN default household and never converge.
 *   This is acceptable for PR #7.5's stated goal ("delete the manual SQL
 *   provisioning step for single-device sign-in"); multi-device convergence
 *   is a PR #8 concern.
 */
import * as Crypto from 'expo-crypto';
import { getPowerSync } from '../../data/powersync/db';

const DEFAULT_HOUSEHOLD_NAME = 'My Pantry';
const OWNER_ROLE = 'owner';

export async function ensureDefaultHousehold(userId: string): Promise<void> {
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
  // PowerSync's CRUD queue captures both inserts together for the eventual
  // uploadData() pass in PR #8.
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
}
