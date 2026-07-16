/**
 * useExpiringWidget (iOS) — pushes the live pantry's "expiring soon" snapshot
 * into the ExpiringSoonWidget (expo-widgets) so the home/lock-screen widget
 * stays current without running app JS.
 *
 * Platform-split: this .ios.ts file is only bundled on iOS; Android resolves
 * the no-op in useExpiringWidget.ts, keeping expo-widgets out of that bundle.
 *
 * Mounted once high in the authenticated tree (App.tsx › AppStack). On every
 * pantry change it recomputes the snapshot and calls updateSnapshot, which
 * persists the props and asks WidgetKit to reload.
 *
 * Best-effort by design: the body is wrapped in try/catch so a JS bundle
 * that's ahead of the installed native build (no widget extension yet) fails
 * silently instead of crashing the app.
 */
import { useEffect } from 'react';

import { tokens } from '../../theme/tokens';
import { usePantryItems } from '../pantry/usePantryItems';
import { buildExpiringSnapshot } from './expiringSnapshot';
import { ExpiringSoonWidget } from './ExpiringSoonWidget';
import { buildWidgetThemePair } from './widgetTheme';
import { EXPIRING_WIDGET_URL } from './widgetLinks';

export function useExpiringWidget(): void {
  const { items } = usePantryItems();

  useEffect(() => {
    try {
      ExpiringSoonWidget.updateSnapshot({
        ...buildExpiringSnapshot(items, new Date()),
        brandName: tokens.brandName,
        url: EXPIRING_WIDGET_URL,
        theme: buildWidgetThemePair(),
      });
    } catch {
      // Widget extension not in this native build yet, or a transient native
      // failure — non-fatal.
    }
  }, [items]);
}
