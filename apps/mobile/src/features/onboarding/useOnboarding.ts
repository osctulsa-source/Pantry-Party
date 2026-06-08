/**
 * First-run onboarding gate. Persists a per-user "onboarded" flag in
 * AsyncStorage so the welcome / stock-your-pantry flow shows exactly once.
 *
 * Returns:
 *  - needsOnboarding: true only once we KNOW the user hasn't onboarded
 *  - loading: true while the flag is being read (avoids a flash of onboarding)
 *  - complete(): persist the flag + flip state so AppRoot swaps to the app
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const storageKey = (userId: string) => `onboarded:${userId}`;

export function useOnboarding(userId: string | null) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setOnboarded(null);
      return;
    }
    AsyncStorage.getItem(storageKey(userId))
      .then((v) => {
        if (!cancelled) setOnboarded(v === '1');
      })
      .catch(() => {
        // On a read failure don't trap the user in onboarding — treat as done.
        if (!cancelled) setOnboarded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const complete = useCallback(async () => {
    if (userId) {
      try {
        await AsyncStorage.setItem(storageKey(userId), '1');
      } catch {
        // Non-fatal: worst case the flow shows again next launch.
      }
    }
    setOnboarded(true);
  }, [userId]);

  return {
    needsOnboarding: userId !== null && onboarded === false,
    loading: userId !== null && onboarded === null,
    complete,
  };
}
