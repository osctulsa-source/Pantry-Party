/**
 * First-run onboarding gate. Persists a per-user "onboarded" flag in
 * AsyncStorage so the welcome / stock-your-pantry flow shows exactly once —
 * but AsyncStorage is device-local and never syncs, so on its own this flag
 * can't tell a genuinely new account from an existing one signing in on a
 * SECOND device. To cover that case, this also watches synced pantry data
 * across every household the user belongs to (not just the active one): a
 * new phone can briefly attach to an empty duplicate household while the
 * original pantry is still in another membership. If any items show up, that's
 * proof onboarding already happened elsewhere.
 *
 * Because PowerSync is local-first, "no pantry rows yet" is ambiguous right
 * after login — it's either a truly empty household or a returning user's
 * data that just hasn't synced down yet. We wait (bounded) for the initial
 * sync to settle before trusting an empty result, so a returning user's
 * second device doesn't flash onboarding while their data is still in transit.
 *
 * Returns:
 *  - needsOnboarding: true only once we KNOW the user hasn't onboarded
 *  - loading: true while that's still being determined (avoids a flash)
 *  - complete(): persist the flag + flip state so AppRoot swaps to the app
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useStatus } from '@powersync/react-native';
import {
  isExistingServerHousehold,
  subscribeExistingServerHousehold,
} from '../household/serverHouseholdHint';

const storageKey = (userId: string) => `onboarded:${userId}`;
// Bounds the wait for a genuinely offline first launch — after this we fall
// back to whatever we know locally rather than hanging on a spinner forever.
const SYNC_WAIT_MS = 8000;

export function useOnboarding(userId: string | null) {
  const [localFlag, setLocalFlag] = useState<boolean | null>(null);
  const [existingAccount, setExistingAccount] = useState(isExistingServerHousehold);
  const status = useStatus();
  const { data: pantryRows } = useQuery<{ id: string }>(
    'SELECT id FROM pantry_items WHERE deleted = 0 LIMIT 1',
    [],
  );
  const hasPantryData = (pantryRows?.length ?? 0) > 0;

  useEffect(() => {
    return subscribeExistingServerHousehold(setExistingAccount);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setLocalFlag(null);
      return;
    }
    AsyncStorage.getItem(storageKey(userId))
      .then((v) => {
        if (!cancelled) setLocalFlag(v === '1');
      })
      .catch(() => {
        // On a read failure don't trap the user in onboarding — treat as done.
        if (!cancelled) setLocalFlag(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Cross-device fallback: synced pantry data appearing for an account with
  // no local flag means onboarding already happened on another device —
  // backfill so we never have to make this check again.
  useEffect(() => {
    if (userId && (hasPantryData || existingAccount) && localFlag === false) {
      AsyncStorage.setItem(storageKey(userId), '1').catch(() => {});
      setLocalFlag(true);
    }
  }, [userId, hasPantryData, existingAccount, localFlag]);

  const [waitedForSync, setWaitedForSync] = useState(false);
  useEffect(() => {
    if (status.hasSynced) {
      setWaitedForSync(true);
      return;
    }
    const t = setTimeout(() => setWaitedForSync(true), SYNC_WAIT_MS);
    return () => clearTimeout(t);
  }, [status.hasSynced]);

  const complete = useCallback(async () => {
    if (userId) {
      try {
        await AsyncStorage.setItem(storageKey(userId), '1');
      } catch {
        // Non-fatal: worst case the flow shows again next launch.
      }
    }
    setLocalFlag(true);
  }, [userId]);

  // Known the moment the local flag says done or pantry data proves it —
  // otherwise only once we've given sync a fair chance to settle.
  const known =
    localFlag === true ||
    hasPantryData ||
    existingAccount ||
    (localFlag === false && waitedForSync);

  return {
    needsOnboarding:
      userId !== null && known && localFlag !== true && !hasPantryData && !existingAccount,
    loading: userId !== null && !known,
    complete,
  };
}
