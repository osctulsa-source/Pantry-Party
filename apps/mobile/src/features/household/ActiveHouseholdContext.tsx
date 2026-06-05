/**
 * ActiveHouseholdContext — per-device "which household is current?" state.
 *
 * Why per-device (not synced):
 *   v1 active-household preference is a UI-local concept; syncing it across
 *   devices was a deliberate non-goal for PR C. Each install picks its own
 *   active household. Promoting this to a synced preference later is purely
 *   additive — replace the AsyncStorage write with a CRUD insert into a
 *   user_preferences table.
 *
 * Bootstrap order on (re)mount, per Auth user_id:
 *   1. Read AsyncStorage[STORAGE_KEY]
 *   2. If a stored id exists → use it. (We trust the stored value even if the
 *      user no longer belongs to that household — sync rules will simply yield
 *      no rows and the user can switch via HouseholdScreen.)
 *   3. Otherwise → query user_households via the PowerSync db (one-shot,
 *      NOT reactive) for the most-recently-created membership and use that
 *      as the default. Persist it so subsequent launches skip the query.
 *   4. If the user has zero memberships (shouldn't happen post-
 *      ensureDefaultHousehold) → leave activeHouseholdId null, isLoading false.
 *
 * Writes (setActiveHouseholdId): update state immediately, then persist
 * fire-and-forget. Storage failures are warned but don't block the UI — losing
 * a single preference write is cheap; blocking a household-switch tap on disk
 * I/O is not.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../auth/AuthContext';
import { getPowerSync } from '../../data/powersync/db';

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

  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Guards against late-arriving bootstrap writes after the user signed out /
  // switched accounts — only the latest bootstrap run is allowed to set state.
  const bootstrapTokenRef = useRef(0);

  useEffect(() => {
    if (authState.status === 'loading') {
      // Defer — AuthContext is still resolving the initial session.
      setIsLoading(true);
      return;
    }
    if (!userId) {
      // Signed out. Clear any in-memory active id; leave AsyncStorage alone so
      // the same user signing back in on the same device gets their pick back.
      setActiveHouseholdIdState(null);
      setIsLoading(false);
      return;
    }

    const token = ++bootstrapTokenRef.current;
    setIsLoading(true);

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (token !== bootstrapTokenRef.current) return;

        if (stored) {
          setActiveHouseholdIdState(stored);
          setIsLoading(false);
          return;
        }

        // No stored preference — fall back to the most-recently-created
        // membership. One-shot getAll (not useQuery): bootstrap doesn't need
        // reactive resubscription, and we don't want a stale fallback racing
        // a user-initiated setActiveHouseholdId().
        const rows = await getPowerSync().getAll<{ household_id: string }>(
          `SELECT household_id FROM user_households
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId],
        );
        if (token !== bootstrapTokenRef.current) return;

        const fallback = rows[0]?.household_id ?? null;
        setActiveHouseholdIdState(fallback);
        setIsLoading(false);

        if (fallback) {
          AsyncStorage.setItem(STORAGE_KEY, fallback).catch((e: unknown) => {
            console.warn('[ActiveHouseholdContext] failed to persist bootstrap fallback:', e);
          });
        }
      } catch (e: unknown) {
        if (token !== bootstrapTokenRef.current) return;
        console.warn('[ActiveHouseholdContext] bootstrap failed:', e);
        setActiveHouseholdIdState(null);
        setIsLoading(false);
      }
    })();
  }, [authState.status, userId]);

  const setActiveHouseholdId = useCallback((id: string) => {
    setActiveHouseholdIdState(id);
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
