/**
 * PantryScreen — reactive, sectioned view over PowerSync's local SQLite.
 *
 * Replaces the flat list with a collapsible SectionList: a pinned "Use soon"
 * section (items expiring soon or already expired) on top, then one section per
 * storage location (Fridge / Freezer / Pantry, and any custom locations). Each
 * item appears once — "Use soon" is exclusive, so urgent items aren't repeated
 * in their location section. Within every section, soonest-to-expire is first
 * (the SQL ORDER BY already sorts that way; grouping preserves it).
 *
 * Sections collapse on header tap (in-memory state). All styling pulls from
 * theme/tokens (ADR-006); expiry rendered via the colorblind-safe <ExpiryPill>.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  type SectionListData,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@powersync/react-native';

import { tokens } from '../../theme/tokens';
import type { PantryItemRow } from '../../data/powersync/schema';
import { getExpiryStatus, parsePantryItem, type PantryItem } from '@breadbox/core';
import { formatExpiryMeta } from './expiryFormat';
import { ExpiryPill } from '../../components/ExpiryPill';
import { useExpiryNotifications } from '../expiry/useExpiryNotifications';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import type { RootStackParamList } from '../../../App';

const PANTRY_QUERY =
  'SELECT * FROM pantry_items WHERE deleted = 0 AND household_id = ? ' +
  'ORDER BY (expires_at IS NULL), expires_at ASC, name ASC';

// Order locations sensibly; unknown/custom locations sort after, alphabetically.
const LOCATION_ORDER = ['fridge', 'freezer', 'pantry'];

interface PantrySection {
  title: string;
  urgent: boolean;
  count: number; // full size, even when collapsed
  data: PantryItem[]; // empty when collapsed
}

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

function titleCase(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function PantryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Pantry'>>();
  const { activeHouseholdId, isLoading: activeLoading } = useActiveHousehold();

  const { data: rows, isLoading, error } = useQuery<PantryItemRow>(PANTRY_QUERY, [activeHouseholdId ?? '']);

  const [items, setItems] = useState<PantryItem[]>([]);
  useEffect(() => {
    if (error) {
      console.warn('[PantryScreen] reactive query error:', error);
      return;
    }
    setItems(rows.map(rowToPantryItem));
  }, [rows, error]);

  const [refreshing, setRefreshing] = useState(false);
  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }

  // Collapsed section titles (in-memory; resets if you leave the screen).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleSection(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  useExpiryNotifications(items);

  const now = useMemo(() => new Date(), [items]);

  const soonCount = useMemo(
    () => items.filter((i) => getExpiryStatus(i, now) !== 'fresh').length,
    [items, now],
  );

  // Build sections: "Use soon" (urgent, exclusive) + one per location. Items
  // arrive already soonest-first, so each bucket preserves that order.
  const sections = useMemo<PantrySection[]>(() => {
    const urgent: PantryItem[] = [];
    const byLocation = new Map<string, PantryItem[]>();
    for (const item of items) {
      if (getExpiryStatus(item, now) !== 'fresh') {
        urgent.push(item);
        continue;
      }
      const loc = item.location || 'pantry';
      const bucket = byLocation.get(loc) ?? [];
      bucket.push(item);
      byLocation.set(loc, bucket);
    }

    const out: PantrySection[] = [];
    if (urgent.length > 0) {
      out.push({ title: 'Use soon', urgent: true, count: urgent.length, data: collapsed.has('Use soon') ? [] : urgent });
    }

    const locations = [...byLocation.keys()].sort((a, b) => {
      const ia = LOCATION_ORDER.indexOf(a);
      const ib = LOCATION_ORDER.indexOf(b);
      const ra = ia === -1 ? LOCATION_ORDER.length : ia;
      const rb = ib === -1 ? LOCATION_ORDER.length : ib;
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });
    for (const loc of locations) {
      const bucket = byLocation.get(loc) ?? [];
      const title = titleCase(loc);
      out.push({ title, urgent: false, count: bucket.length, data: collapsed.has(title) ? [] : bucket });
    }
    return out;
  }, [items, now, collapsed]);

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
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {soonCount > 0 ? (
              <Text style={styles.countSoon}>{`  ·  ${soonCount} to use soon`}</Text>
            ) : (
              ' in your pantry'
            )}
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
      <View style={styles.actionRow}>
        <Pressable onPress={() => navigation.navigate('Recipes')} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>Find recipes →</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('QuickAdd')} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>＋ Quick add</Text>
        </Pressable>
      </View>
      <SectionList<PantryItem, PantrySection>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PantryRow item={item} now={now} onPress={() => navigation.navigate('EditItem', { itemId: item.id })} />
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader section={section} collapsed={collapsed.has(section.title)} onToggle={() => toggleSection(section.title)} />
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={items.length === 0 ? styles.listEmpty : styles.list}
        ListEmptyComponent={items.length === 0 ? <PantryEmpty onAdd={() => navigation.navigate('AddItem')} /> : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.accent} />}
      />
    </SafeAreaView>
  );
}

function SectionHeader({
  section,
  collapsed,
  onToggle,
}: {
  section: SectionListData<PantryItem, PantrySection>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <Text style={[styles.sectionTitle, section.urgent && styles.sectionTitleUrgent]}>{section.title}</Text>
      <View style={styles.sectionRight}>
        <Text style={styles.sectionCount}>{section.count}</Text>
        <Text style={styles.sectionChevron}>{collapsed ? '▸' : '▾'}</Text>
      </View>
    </Pressable>
  );
}

function PantryRow({ item, now, onPress }: { item: PantryItem; now: Date; onPress: () => void }) {
  const status = getExpiryStatus(item, now);
  const expiryText = formatExpiryMeta(item, now);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>
          {item.quantity}
          {item.unit ? ` ${item.unit}` : ''}
          {item.location ? ` · ${item.location}` : ''}
          {item.brand ? ` · ${item.brand}` : ''}
        </Text>
      </View>
      {expiryText && <ExpiryPill status={status} label={expiryText} />}
    </Pressable>
  );
}

function PantryEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Your pantry's empty</Text>
      <Text style={styles.emptySub}>
        Add an item to start tracking freshness and get recipe ideas from what you already have.
      </Text>
      <Pressable style={styles.emptyBtn} onPress={onAdd}>
        <Text style={styles.emptyBtnText}>Add your first item</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(3),
  },
  headerMain: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(4), paddingTop: tokens.space(2) },
  addItem: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.success },
  settings: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.accent },
  brand: { fontFamily: tokens.font.display.bold, fontSize: 28, color: tokens.color.ink, letterSpacing: -0.5 },
  count: { marginTop: tokens.space(1), fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted },
  countSoon: { fontFamily: tokens.font.body.semibold, color: tokens.semantic.expiry.warning },
  actionRow: { flexDirection: 'row', gap: tokens.space(3), marginHorizontal: tokens.space(6), marginBottom: tokens.space(3) },
  actionBtn: {
    flex: 1,
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  actionBtnText: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
  list: { paddingBottom: tokens.space(8) },
  listEmpty: { flexGrow: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(2),
    backgroundColor: tokens.color.surface, // opaque so sticky headers don't show rows through
  },
  sectionTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
  },
  sectionTitleUrgent: { color: tokens.semantic.expiry.warning },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  sectionCount: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted, fontVariant: ['tabular-nums'] },
  sectionChevron: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowPressed: { backgroundColor: tokens.color.surfaceAlt },
  rowMain: { flex: 1, marginRight: tokens.space(3) },
  name: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  meta: { marginTop: 2, fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 20,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: tokens.space(5),
  },
  emptyBtn: {
    backgroundColor: tokens.color.accent,
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(6),
    borderRadius: tokens.radius.md,
  },
  emptyBtnText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
});
