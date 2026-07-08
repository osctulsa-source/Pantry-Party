/**
 * useFavoriteStores — per-user grocery store preferences, persisted on-device.
 *
 * Chains come from @breadbox/core STORE_CHAINS; users can also add custom local
 * store names. Wired into text OCR parsing for header detection and chain-specific
 * noise rules.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chainById } from '@breadbox/core';

export interface FavoriteStore {
  /** Chain id from STORE_CHAINS, or `custom:<slug>` for local names. */
  id: string;
  name: string;
  kind: 'chain' | 'custom';
}

const MAX_FAVORITES = 12;
const EMPTY: FavoriteStore[] = [];
const storageKey = (userId: string) => `favoriteStores:${userId}`;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function useFavoriteStores(userId: string | null) {
  const [stores, setStores] = useState<FavoriteStore[]>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setStores(EMPTY);
      setReady(true);
      return;
    }
    setReady(false);
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled) return;
        try {
          setStores(raw ? (JSON.parse(raw) as FavoriteStore[]) : EMPTY);
        } catch {
          setStores(EMPTY);
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setStores(EMPTY);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (next: FavoriteStore[]) => {
      setStores(next);
      if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
    },
    [userId],
  );

  const addChain = useCallback(
    (chainId: string) => {
      const chain = chainById(chainId);
      if (!chain) return;
      persist(
        stores.some((s) => s.id === chainId)
          ? stores
          : stores.length >= MAX_FAVORITES
            ? stores
            : [...stores, { id: chainId, name: chain.name, kind: 'chain' }],
      );
    },
    [persist, stores],
  );

  const addCustom = useCallback(
    (name: string) => {
      const trimmed = name.trim().slice(0, 60);
      if (!trimmed) return;
      const id = `custom:${slugify(trimmed)}`;
      if (stores.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;
      if (stores.length >= MAX_FAVORITES) return;
      persist([...stores, { id, name: trimmed, kind: 'custom' }]);
    },
    [persist, stores],
  );

  const remove = useCallback(
    (id: string) => {
      persist(stores.filter((s) => s.id !== id));
    },
    [persist, stores],
  );

  return { stores, ready, addChain, addCustom, remove, maxFavorites: MAX_FAVORITES };
}
