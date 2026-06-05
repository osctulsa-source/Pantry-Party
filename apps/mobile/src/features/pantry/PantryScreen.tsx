/**
 * PantryScreen — reactive view over PowerSync's local SQLite.
 *
 * Uses `useQuery` from @powersync/react-native, which subscribes to the
 * underlying watched query and re-renders whenever `pantry_items` changes —
 * whether the change came from the local Add Item form, an upload-proxy
 * round-trip, or a sync stream push. No more "navigate back, pull to refresh"
 * dance. The PowerSyncContext.Provider lives in App.tsx.
 *
 * All styling pulls from `theme/tokens` — no hardcoded colors, fonts, or
 * spacing values (ADR-006).
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@powersync/react-native';

import { tokens } from '../../theme/tokens';
import type { PantryItemRow } from '../../data/powersync/schema';
import { getExpiryStatus, parsePantryItem, type PantryItem } from '@breadbox/core';
import { formatExpiryMeta } from './expiryFormat';
import { useExpiryNotifications } from '../expiry/useExpiryNotifications';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import type { RootStackParamList } from '../../../App';

// Scoped to the active household so multi-household users see only the
// relevant pantry. PowerSync's sync rules already stream every household the
// user belongs to into local SQLite; the WHERE clause here is the client-side
// filter that picks the active one.
const PANTRY_QUERY =
  'SELECT * FROM pantry_items WHERE deleted = 0 AND household_id = ? ORDER BY name';

// Mirrors rowToPantryItem in powerSyncPantry.ts. Duplicated intentionally so
// this PR stays scoped to two files (App.tsx + this one). If a third consumer
// of the mapping shows up, lift it into a shared helper.
function rowToPantryItem(row: PantryItemRow): PantryItem {
  return parsePantryItem({
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    barcode: row.barcode ?? undefined,
    quantity: row.quantity,
    unit: row.unit ?? undefined,
    location: row.location,
    addedAt: row.added_at,
    expiresAt: row.expires_at ?? undefined,
    source: row.source,
    addedBy: row.added_by,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  });
}

export function PantryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Pantry'>>();
  const { activeHouseholdId, isLoading: activeLoading } = useActiveHousehold();

  // Bind to an empty string when no active household is set — the query stays
  // valid (returns 0 rows) and we render the loading state below before
  // showing the empty list.
  const { data: rows, isLoading, error } = useQuery<PantryItemRow>(
    PANTRY_QUERY,
    [activeHouseholdId ?? ''],
  );
  // Keep the last good list across transient errors (e.g. SQLite disconnect on
  // sign-out): if `error` is set, we log and preserve `items` from the prior
  // successful render. Otherwise we map the latest rows through parsePantryItem.
  const [items, setItems] = useState<PantryItem[]>([]);
  useEffect(() => {
    if (error) {
      console.warn('[PantryScreen] reactive query error:', error);
      return;
    }
    setItems(rows.map(rowToPantryItem));
  }, [rows, error]);

  // Pull-to-refresh is preserved as a brief visual ack — the watch is the
  // single source of truth, so there's nothing to actually refetch. Keeping
  // the gesture handled because some users tap it instinctively.
  const [refreshing, setRefreshing] = useState(false);
  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }

  useExpiryNotifications(items);

  // Compute once per render so every row sees the same "now" — avoids drift mid-list.
  const now = useMemo(() => new Date(), [items]);

  // Loading covers (a) AsyncStorage bootstrap of the active household, (b) the
  // null gap before bootstrap picks a default, and (c) the initial reactive
  // query before any rows arrive.
  if (activeLoading || !activeHouseholdId || (isLoading && items.length === 0)) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.brand}>{tokens.brandName}</Text>
          <Text style={styles.count}>
            {items.length} {items.length === 1 ? 'item' : 'items'} in your pantry
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('AddItem')} hitSlop={8}>
            <Text style={styles.addItem}>+ Add</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={8}>
            <Text style={styles.settings}>Settings</Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        onPress={() => navigation.navigate('Recipes')}
        style={styles.cookButton}
      >
        <Text style={styles.cookButtonText}>Find recipes →</Text>
      </Pressable>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PantryRow
            item={item}
            now={now}
            onPress={() => navigation.navigate('EditItem', { itemId: item.id })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.accent} />}
      />
    </SafeAreaView>
  );
}

function PantryRow({ item, now, onPress }: { item: PantryItem; now: Date; onPress: () => void }) {
  const status = getExpiryStatus(item, now);
  const expiryText = formatExpiryMeta(item, now);
  const expiryColor =
    status === 'warning'
      ? tokens.semantic.expiry.warning
      : status === 'expired'
        ? tokens.semantic.expiry.expired
        : tokens.semantic.expiry.fresh;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.quantity}
          {item.unit ? ` ${item.unit}` : ''}
          {item.location ? ` · ${item.location}` : ''}
          {item.brand ? ` · ${item.brand}` : ''}
        </Text>
      </View>
      {expiryText && (
        <Text style={[styles.expiry, { color: expiryColor }]}>{expiryText}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(3),
  },
  headerMain: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(4),
    paddingTop: tokens.space(2),
  },
  addItem: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: tokens.color.success,
  },
  settings: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.accent,
  },
  brand: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: -0.5,
  },
  count: {
    marginTop: tokens.space(1),
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
  cookButton: {
    marginHorizontal: tokens.space(6),
    marginBottom: tokens.space(3),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 8,
    alignItems: 'center',
  },
  cookButtonText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 14,
    color: tokens.color.accent,
  },
  list: {
    paddingBottom: tokens.space(8),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.surfaceAlt,
  },
  rowPressed: {
    backgroundColor: tokens.color.surfaceAlt,
  },
  rowMain: {
    flex: 1,
  },
  name: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.ink,
  },
  meta: {
    marginTop: 2,
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
  expiry: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    // Color is set inline per row from tokens.semantic.expiry — fresh / warning / expired.
  },
});
