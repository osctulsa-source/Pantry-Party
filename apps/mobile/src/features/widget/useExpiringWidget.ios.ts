/**
 * useExpiringWidget — mirrors the live pantry into the shared App Group so the
 * native widget (targets/widget/index.swift) can render "what's expiring"
 * without running JS.
 *
 * Mounted once high in the authenticated tree (App.tsx › AppStack). On every
 * pantry change it recomputes the snapshot, writes it to the App Group via
 * ExtensionStorage, and asks WidgetKit to reload its timelines.
 *
 * Best-effort by design: iOS-only, and the whole body is wrapped in try/catch
 * so that before the native widget target exists (i.e. before the user runs
 * `expo prebuild` + a dev build) the missing native module fails silently
 * instead of crashing the app.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';

import { usePantryItems } from '../pantry/usePantryItems';
import { APP_GROUP, SNAPSHOT_KEY, buildExpiringSnapshot } from './expiringSnapshot';

export function useExpiringWidget(): void {
  const { items } = usePantryItems();

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    try {
      const snapshot = buildExpiringSnapshot(items, new Date());
      const storage = new ExtensionStorage(APP_GROUP);
      // Store a JSON string — the deterministic contract the Swift decoder
      // expects (UserDefaults.string(forKey:) → JSONDecoder).
      storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
      ExtensionStorage.reloadWidget();
    } catch {
      // Native target not built yet, or a transient write failure — non-fatal.
    }
  }, [items]);
}
