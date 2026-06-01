/**
 * PantryScreen — the first walking-skeleton screen.
 *
 * Reads from `stubPantry` for now; swaps to a PowerSync-backed repository in a
 * later prompt. All styling pulls from `theme/tokens` — no hardcoded colors,
 * fonts, or spacing values (ADR-006).
 */
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../theme/tokens';
import { stubPantry } from '../../data/stubPantry';
import { daysUntilExpiry, type PantryItem } from '@breadbox/core';

export function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setItems(await stubPantry.list());
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.brand}>{tokens.brandName}</Text>
        <Text style={styles.count}>
          {items.length} {items.length === 1 ? 'item' : 'items'} in your pantry
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PantryRow item={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={tokens.color.accent} />}
      />
    </SafeAreaView>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const days = daysUntilExpiry(item);
  const isUrgent = days !== null && days <= 3;
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
      {days !== null && (
        <Text style={[styles.expiry, isUrgent && styles.expiryUrgent]}>
          {days < 0 ? `expired ${Math.abs(days)}d ago` : days === 0 ? 'expires today' : `${days}d`}
        </Text>
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
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
  expiryUrgent: {
    color: tokens.color.accent,
    // No fontWeight — system mono can't render synthesized bold cleanly,
    // and the accent color is doing the urgency work already.
  },
});
