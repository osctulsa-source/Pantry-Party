/**
 * useQuickAddConfig — per-user Quick Add layout config, persisted on-device
 * (AsyncStorage). Holds which default staple sections are hidden and any custom
 * chips the user pins. (The item bank itself is synced + derived separately via
 * usePersonalBank; this is just display preference, which doesn't need to sync.)
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageLocation } from '@breadbox/core';

export interface CustomItem {
  name: string;
  location: StorageLocation;
}
export interface QuickAddConfig {
  hiddenGroups: string[];
  custom: CustomItem[];
}

const EMPTY: QuickAddConfig = { hiddenGroups: [], custom: [] };
const storageKey = (userId: string) => `quickAddConfig:${userId}`;

/**
 * Coerce a parsed value into a valid config. A partial/corrupt stored blob
 * (e.g. `{ "hiddenGroups": null }`) must never leave a non-array on the
 * config — `toggleGroup`/`addCustom` call array methods on these fields.
 */
function sanitizeConfig(raw: unknown): QuickAddConfig {
  const parsed = (raw ?? {}) as Partial<QuickAddConfig>;
  return {
    hiddenGroups: Array.isArray(parsed.hiddenGroups) ? parsed.hiddenGroups : [],
    custom: Array.isArray(parsed.custom) ? parsed.custom : [],
  };
}

export function useQuickAddConfig(userId: string | null) {
  const [config, setConfig] = useState<QuickAddConfig>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setConfig(EMPTY);
      return;
    }
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled) return;
        try {
          setConfig(raw ? sanitizeConfig(JSON.parse(raw)) : EMPTY);
        } catch {
          setConfig(EMPTY);
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = useCallback(
    (fn: (c: QuickAddConfig) => QuickAddConfig) => {
      setConfig((prev) => {
        const next = fn(prev);
        if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  const toggleGroup = useCallback(
    (title: string) =>
      update((c) => ({
        ...c,
        hiddenGroups: c.hiddenGroups.includes(title)
          ? c.hiddenGroups.filter((t) => t !== title)
          : [...c.hiddenGroups, title],
      })),
    [update],
  );

  const addCustom = useCallback(
    (item: CustomItem) =>
      update((c) =>
        c.custom.some((x) => x.name.toLowerCase() === item.name.toLowerCase())
          ? c
          : { ...c, custom: [...c.custom, item] },
      ),
    [update],
  );

  const removeCustom = useCallback(
    (name: string) => update((c) => ({ ...c, custom: c.custom.filter((x) => x.name !== name) })),
    [update],
  );

  return { config, toggleGroup, addCustom, removeCustom };
}
