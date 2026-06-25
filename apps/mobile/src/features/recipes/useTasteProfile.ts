/**
 * useTasteProfile — loads/persists the per-household taste profile (the flavor
 * quiz answers) in AsyncStorage. Plain on-device JSON, mirroring useRecipePrefs;
 * the seeding math (seedPrefsFromTaste) lives in @breadbox/core. Phase 1 is
 * device-local: Your Kitchen's header + the quiz read/write this, and the Cook
 * ranking blends seedPrefsFromTaste(profile) in a later step.
 *
 * `loaded` lets the screen wait before deciding whether to show the
 * "Set your taste" card, so it doesn't flash for someone who already has one.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_TASTE_PROFILE, type TasteProfile } from '@breadbox/core';

const storageKey = (householdId: string) => `tasteProfile:${householdId}`;

export function useTasteProfile(householdId: string | null) {
  const [profile, setProfile] = useState<TasteProfile>(EMPTY_TASTE_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    if (!householdId) {
      setProfile(EMPTY_TASTE_PROFILE);
      setLoaded(true);
      return;
    }
    AsyncStorage.getItem(storageKey(householdId))
      .then((raw) => {
        if (cancelled) return;
        try {
          // Merge over EMPTY so older/partial stored JSON gains any new fields.
          setProfile(
            raw ? { ...EMPTY_TASTE_PROFILE, ...(JSON.parse(raw) as Partial<TasteProfile>) } : EMPTY_TASTE_PROFILE,
          );
        } catch {
          setProfile(EMPTY_TASTE_PROFILE);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(EMPTY_TASTE_PROFILE);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const save = useCallback(
    (next: TasteProfile) => {
      const stamped: TasteProfile = { ...next, updatedAt: new Date().toISOString() };
      setProfile(stamped);
      if (householdId) {
        AsyncStorage.setItem(storageKey(householdId), JSON.stringify(stamped)).catch(() => {});
      }
    },
    [householdId],
  );

  return { profile, save, loaded };
}
