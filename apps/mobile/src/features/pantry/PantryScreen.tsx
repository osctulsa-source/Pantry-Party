/**
 * PantryScreen — the first walking-skeleton screen.
 *
 * Reads from `stubPantry` for now; swaps to a PowerSync-backed repository in a
 * later prompt. All styling pulls from `theme/tokens` — no hardcoded colors,
 * fonts, or spacing values (ADR-006).
 */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tokens } from '../../theme/tokens';
import { powerSyncPantry } from '../../data/powerSyncPantry';
import { getExpiryStatus, type PantryItem } from '@breadbox/core';
import { formatExpiryMeta } from './expiryFormat';
import type { RootStackParamList } from '../../../App';

export function PantryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Pantry'>>();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setItems(await powerSyncPantry.list());
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Compute once per render so every row sees the same "now" — avoids drift mid-list.
  const now = new Date();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.brand}>{tokens.brandName}</Text>
        <Text style={styles.count}>
          {items.length} {items.length === 1 ? 'item' : 'items'} in your pantry
        </Text>
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
        renderItem={({ item }) => <PantryRow item={item} now={now} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={tokens.color.accent} />}
      />
    </SafeAreaView>
  );
}

function PantryRow({ item, now }: { item: PantryItem; now: Date }) {
  const status = getExpiryStatus(item, now);
  const expiryText = formatExpiryMeta(item, now);
  const expiryColor =
    status === 'warning'
      ? tokens.semantic.expiry.warning
      : status === 'expired'
        ? tokens.semantic.expiry.expired
        : tokens.semantic.expiry.fresh;
  return (
    <View style={styles.row}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  header: {
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(3),
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
