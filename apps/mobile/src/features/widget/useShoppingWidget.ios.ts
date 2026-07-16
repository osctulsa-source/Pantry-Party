/**
 * useShoppingWidget (iOS) — pushes the household's shopping list into the
 * ShoppingListWidget (expo-widgets), mirroring useExpiringWidget's pattern:
 * mounted once in the authenticated tree, reactive over the synced
 * shopping_list_items table, best-effort.
 *
 * Platform-split: this .ios.ts file is only bundled on iOS; Android resolves
 * the no-op in useShoppingWidget.ts.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@powersync/react-native';

import { tokens } from '../../theme/tokens';
import { rowToShoppingListItem } from '../../data/powersync/mapShoppingRow';
import type { ShoppingListItemRow } from '../../data/powersync/schema';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { buildShoppingSnapshot } from './shoppingSnapshot';
import { ShoppingListWidget } from './ShoppingListWidget';
import { buildWidgetThemePair } from './widgetTheme';
import { SHOPPING_WIDGET_URL } from './widgetLinks';

// Same ordering as ShoppingScreen: things still to buy, newest first.
const QUERY =
  'SELECT * FROM shopping_list_items WHERE deleted = 0 AND checked = 0 AND household_id = ? ' +
  'ORDER BY added_at DESC';

export function useShoppingWidget(): void {
  const { activeHouseholdId } = useActiveHousehold();
  const { data: rows } = useQuery<ShoppingListItemRow>(QUERY, [activeHouseholdId ?? '']);
  const items = useMemo(() => rows.map(rowToShoppingListItem), [rows]);

  useEffect(() => {
    try {
      ShoppingListWidget.updateSnapshot({
        ...buildShoppingSnapshot(items),
        brandName: tokens.brandName,
        url: SHOPPING_WIDGET_URL,
        theme: buildWidgetThemePair(),
      });
    } catch {
      // Widget extension not in this native build yet — non-fatal.
    }
  }, [items]);
}
