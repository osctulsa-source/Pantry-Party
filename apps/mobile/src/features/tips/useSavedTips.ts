/**
 * useSavedTips — per-user bookmarked kitchen tips, persisted on-device
 * (AsyncStorage, same pattern as useQuickAddConfig). Display preference only,
 * so it doesn't sync; a null userId keeps toggles in-memory for the session.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const storageKey = (userId: string) => `savedTips:${userId}`;

export function useSavedTips(userId: string | null) {
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setSavedIds([]);
      return;
    }
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled) return;
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          setSavedIds(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
        } catch {
          setSavedIds([]);
        }
      })
      .catch(() => {
        if (!cancelled) setSavedIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    (id: string) => {
      setSavedIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  return { savedIds, toggle };
}
