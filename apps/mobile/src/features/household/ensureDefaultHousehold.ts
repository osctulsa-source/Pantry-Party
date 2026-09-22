/**
 * Idempotently provisions a default household + owner membership.
 *
 * Prefer the server (`POST /household/bootstrap`) so a returning user on a new
 * phone is attached to their existing household instead of creating a second
 * empty pantry. After bootstrap we seed the *same* Postgres ids locally so
 * invite/pantry have a household immediately, even if PowerSync is still
 * downloading. Local INSERT with fresh UUIDs is only the offline fallback.
 *
 * Designed to run in parallel with first sync: the server household id is
 * available even if PowerSync is still downloading rows.
 */
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPowerSync } from '../../data/powersync/db';
import { bootstrapHousehold } from '../../data/api/householdClient';
import {
  markExistingServerHousehold,
  setServerHouseholdHint,
} from './serverHouseholdHint';

const DEFAULT_HOUSEHOLD_NAME = 'My Pantry';
const OWNER_ROLE = 'owner';
const MEMBERSHIP_WAIT_MS = 8_000;
const MEMBERSHIP_POLL_MS = 250;

const inFlightEnsures = new Map<string, Promise<void>>();

async function localMembershipCount(userId: string): Promise<number> {
  const db = getPowerSync();
  const existing = await db.getAll<{ count: number }>(
    'SELECT COUNT(*) AS count FROM user_households WHERE user_id = ?',
    [userId],
  );
  return existing[0]?.count ?? 0;
}

async function waitForLocalMembership(userId: string, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if ((await localMembershipCount(userId)) > 0) return true;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, MEMBERSHIP_POLL_MS);
    });
  }
  return (await localMembershipCount(userId)) > 0;
}

async function hasMembershipFor(
  userId: string,
  householdId: string,
): Promise<boolean> {
  const db = getPowerSync();
  const rows = await db.getAll<{ id: string }>(
    'SELECT id FROM user_households WHERE user_id = ? AND household_id = ? LIMIT 1',
    [userId, householdId],
  );
  return rows.length > 0;
}

/** Copy the server household onto this device using the Postgres row ids. */
export async function seedLocalMembership(input: {
  userId: string;
  householdId: string;
  membershipId: string;
  createdAt?: string;
}): Promise<void> {
  if (await hasMembershipFor(input.userId, input.householdId)) return;
  const db = getPowerSync();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const existingHousehold = await db.getAll<{ id: string }>(
    'SELECT id FROM households WHERE id = ? LIMIT 1',
    [input.householdId],
  );
  await db.writeTransaction(async (tx) => {
    if (existingHousehold.length === 0) {
      await tx.execute(
        `INSERT INTO households (id, name, created_at, created_by)
         VALUES (?, ?, ?, ?)`,
        [input.householdId, DEFAULT_HOUSEHOLD_NAME, createdAt, input.userId],
      );
    }
    await tx.execute(
      `INSERT INTO user_households (id, user_id, household_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [input.membershipId, input.userId, input.householdId, OWNER_ROLE, createdAt],
    );
  });
}

async function insertLocalHousehold(userId: string): Promise<void> {
  const db = getPowerSync();
  const householdId = Crypto.randomUUID();
  const membershipId = Crypto.randomUUID();
  const nowIso = new Date().toISOString();
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

export async function ensureDefaultHousehold(
  userId: string,
  accessToken?: string | null,
): Promise<void> {
  const existing = inFlightEnsures.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (accessToken) {
        try {
          const boot = await bootstrapHousehold(accessToken);
          const alreadyLocal = await hasMembershipFor(userId, boot.household_id);
          if (!alreadyLocal) {
            setServerHouseholdHint(boot.household_id);
          }
          if (!boot.created) {
            markExistingServerHousehold();
            AsyncStorage.setItem(`onboarded:${userId}`, '1').catch(() => {});
          }
          try {
            await seedLocalMembership({
              userId,
              householdId: boot.household_id,
              membershipId: boot.membership_id,
              createdAt: boot.membership_created_at,
            });
          } catch (seedErr: unknown) {
            // Duplicate local row or a racing download — membership may already exist.
            console.error('Household local seed failed:', seedErr);
          }
          await waitForLocalMembership(userId, MEMBERSHIP_WAIT_MS);
          return;
        } catch (e: unknown) {
          console.error('Household bootstrap API failed:', e);
        }
      }

      if ((await localMembershipCount(userId)) > 0) return;
      await insertLocalHousehold(userId);
    } finally {
      inFlightEnsures.delete(userId);
    }
  })();

  inFlightEnsures.set(userId, promise);
  return promise;
}
