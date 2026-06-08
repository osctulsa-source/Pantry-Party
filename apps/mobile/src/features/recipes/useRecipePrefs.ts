/**
 * useRecipePrefs — loads/persists the per-household recipe-preference map
 * (AsyncStorage) and exposes record() to log like/skip/open events. The map
 * itself is plain on-device JSON; the scoring math lives in @breadbox/core.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyPrefEvent, type PrefEvent, type RecipePrefs } from '@breadbox/core';

const storageKey = (householdId: string) => `recipePrefs:${householdId}`;

export function useRecipePrefs(householdId: string | null) {
  const [prefs, setPrefs] = useState<RecipePrefs>({});

  useEffect(() => {
    let cancelled = false;
    if (!householdId) {
      setPrefs({});
      return;
    }
    AsyncStorage.getItem(storageKey(householdId))
      .then((raw) => {
        if (cancelled) return;
        try {
          setPrefs(raw ? (JSON.parse(raw) as RecipePrefs) : {});
        } catch {
          setPrefs({});
        }
      })
      .catch(() => {
        if (!cancelled) setPrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  const record = useCallback(
    (title: string, event: PrefEvent) => {
      setPrefs((prev) => {
        const next = applyPrefEvent(prev, title, event);
        if (householdId) {
          AsyncStorage.setItem(storageKey(householdId), JSON.stringify(next)).catch(() => {});
        }
        return next;
      });
    },
    [householdId],
  );

  return { prefs, record };
}
