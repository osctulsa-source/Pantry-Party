/**
 * ActiveHouseholdContext — per-device "which household is current?" state.
 *
 * Resolution (reactive): activeHouseholdId =
 *   1. an explicit in-session switch (setActiveHouseholdId), else
 *   2. pickActiveHouseholdId — a server bootstrap hint (new phone attaching to
 *      an existing household), else a stored preference only if it is still a
 *      membership and not an empty duplicate next to a stocked pantry, else
 *      a household that already has items, else the oldest membership.
 *
 * Why reactive (bug fix, 2026-07): the previous version ran a ONE-SHOT fallback
 * query the moment auth flipped to authenticated. On a cold first launch that
 * query executes BEFORE PowerSync's first sync completes and before
 * ensureDefaultHousehold creates the row (both fire-and-forget in AuthContext),
 * so it found zero memberships, set activeHouseholdId = null, and never
 * re-queried — leaving the whole app without a household until the user killed
 * and relaunched. Because usePantryItems, onboarding, and the Cook tab all key
 * off this id, that single stale read broke onboarding's quick-add (silent
 * no-op) AND left the main screen stuck loading. A live useQuery self-heals: the
 * instant the household is written locally (ensureDefaultHousehold) or arrives
 * via sync, activeHouseholdId populates and every consumer re-renders — no
 * relaunch needed.
 *
 * Per-device (not synced): v1 active-household preference is UI-local; promoting
 * it to a synced user_preferences row later is purely additive.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@powersync/react-native';

import { useAuth } from '../auth/AuthContext';
import { pickActiveHouseholdId } from './pickActiveHousehold';
import {
  clearServerHouseholdHint,
  getServerHouseholdHint,
  subscribeServerHouseholdHint,
} from './serverHouseholdHint';

const STORAGE_KEY = 'breadbox.activeHouseholdId';

interface ActiveHouseholdContextValue {
  activeHouseholdId: string | null;
  setActiveHouseholdId: (id: string) => void;
  isLoading: boolean;
}

const ActiveHouseholdContext = createContext<ActiveHouseholdContextValue | undefined>(undefined);

export function ActiveHouseholdProvider({ children }: { children: ReactNode }) {
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;

  // Stored per-device preference. `undefined` = not read yet; `null` = read, none.
  const [storedPref, setStoredPref] = useState<string | null | undefined>(undefined);
  const [serverHint, setServerHint] = useState<string | null>(getServerHouseholdHint);
  const [override, setOverride] = useState<string | null>(null);
  const readTokenRef = useRef(0);

  useEffect(() => {
    return subscribeServerHouseholdHint(setServerHint);
  }, []);

  // (Re)read the stored preference whenever the signed-in user changes.
  useEffect(() => {
    setOverride(null);
    if (!userId) {
      clearServerHouseholdHint();
      setStoredPref(null);
      return;
    }
    const token = ++readTokenRef.current;
    setStoredPref(undefined);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (token === readTokenRef.current) setStoredPref(v);
      })
      .catch(() => {
        if (token === readTokenRef.current) setStoredPref(null);
      });
  }, [userId]);

  // Live membership list — updates as ensureDefaultHousehold creates the row and
  // as sync delivers memberships. This is the fix for the first-launch race.
  // Empty-string sentinel matches no user when signed out.
  const { data: memberships } = useQuery<{ household_id: string }>(
    'SELECT household_id FROM user_households WHERE user_id = ? ORDER BY created_at ASC',
    [userId ?? ''],
  );
  const membershipIds = useMemo(
    () => (memberships ?? []).map((m) => m.household_id),
    [memberships],
  );
  const { data: stockedRows } = useQuery<{ household_id: string }>(
    'SELECT household_id FROM pantry_items WHERE deleted = 0 GROUP BY household_id',
    [],
  );
  const householdsWithItems = useMemo(
    () => new Set((stockedRows ?? []).map((row) => row.household_id)),
    [stockedRows],
  );

  const activeHouseholdId = useMemo(() => {
    if (!userId) return null;
    if (override) return override;
    return pickActiveHouseholdId(
      membershipIds,
      serverHint ?? storedPref ?? null,
      householdsWithItems,
    );
  }, [userId, override, storedPref, serverHint, membershipIds, householdsWithItems]);

  // Loading only until the stored preference is read; after that the live query
  // fills activeHouseholdId in as the household appears — we never block the UI
  // waiting on first sync, and never hang.
  const isLoading = authState.status === 'loading' || (userId !== null && storedPref === undefined);

  // Persist whatever we settle on so later launches take the fast path.
  useEffect(() => {
    if (activeHouseholdId) {
      AsyncStorage.setItem(STORAGE_KEY, activeHouseholdId).catch((e: unknown) => {
        console.warn('[ActiveHouseholdContext] failed to persist active household:', e);
      });
    }
  }, [activeHouseholdId]);

  const setActiveHouseholdId = useCallback((id: string) => {
    setOverride(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch((e: unknown) => {
      console.warn('[ActiveHouseholdContext] failed to persist active household:', e);
    });
  }, []);

  return (
    <ActiveHouseholdContext.Provider value={{ activeHouseholdId, setActiveHouseholdId, isLoading }}>
      {children}
    </ActiveHouseholdContext.Provider>
  );
}

export function useActiveHousehold(): ActiveHouseholdContextValue {
  const ctx = useContext(ActiveHouseholdContext);
  if (!ctx) {
    throw new Error('useActiveHousehold must be used within ActiveHouseholdProvider');
  }
  return ctx;
}
