/**
 * useDisplayName — household display names (Display-names arc, PR 2).
 *
 * Reads display_name off the synced user_households rows. PR 1 broadened the
 * membership stream to co-members, so the local DB now holds every member of
 * the households you belong to — this hook turns that into a reactive
 * user_id → name map for resolving actors (History) and members (Household),
 * the current user's own name, and a setter.
 *
 * setMyName writes the name onto ALL of the caller's membership rows (one name
 * across their households); the upload-proxy's per-row PATCH tenancy (PR 1)
 * lets each through because they're all the caller's own.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@powersync/react-native';

import { getPowerSync } from '../../data/powersync/db';
import { useAuth } from '../auth/AuthContext';

interface NameRow {
  user_id: string;
  display_name: string | null;
}

// No WHERE: the local DB already holds only the membership rows the sync rules
// streamed (the user's households' members), so this is the right scope.
const NAMES_QUERY = 'SELECT user_id, display_name FROM user_households';

export function useDisplayName(): {
  names: Map<string, string>;
  myName: string | null;
  setMyName: (name: string) => Promise<void>;
} {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.session.user.id : null;

  const { data: rows } = useQuery<NameRow>(NAMES_QUERY);
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const n = r.display_name?.trim();
      if (n) m.set(r.user_id, n);
    }
    return m;
  }, [rows]);

  const myName = userId ? names.get(userId) ?? null : null;

  const setMyName = useCallback(
    async (name: string) => {
      if (!userId) return;
      const trimmed = name.trim();
      await getPowerSync().execute(
        'UPDATE user_households SET display_name = ? WHERE user_id = ?',
        [trimmed.length > 0 ? trimmed : null, userId],
      );
    },
    [userId],
  );

  return { names, myName, setMyName };
}
