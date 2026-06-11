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
 * Sections collapse on header tap (in-memory state). The "Use soon" header
 * carries a View → tap-through to ExpiringSoonScreen (per-item Used / Tossed /
 * Snooze). Long-pressing any row enters multi-select: tap to toggle, then mark
 * the batch Used (tombstone + rescue events) or Remove (tombstone only) from
 * the selection bar — "clear out four expired things" is one gesture, not
 * twelve taps.
 *
 * The header shows a sync dot driven by PowerSync's live status (green synced /
 * ochre syncing / muted offline) — sync failures stop being invisible.
 *
 * All styling pulls from theme/tokens (ADR-006); expiry rendered via the
 * colorblind-safe <ExpiryPill>.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useQuery, useStatus } from '@powersync/react-native';

import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import type { PantryItemRow } from '../../data/powersync/schema';
import { getExpiryStatus, parsePantryItem, type PantryItem } from '@breadbox/core';
import { formatExpiryMeta } from './expiryFormat';
import { ExpiryPill } from '../../components/ExpiryPill';
import { recordExpiryEvents } from './expiryEvents';
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

/** Live sync indicator: PowerSync status → one calm dot + label. */
function SyncDot() {
  const status = useStatus();
  const syncing = status.dataFlowStatus.uploading || status.dataFlowStatus.downloading;
  const color = status.connected
    ? syncing
      ? tokens.semantic.expiry.warning
      : tokens.color.success
    : tokens.color.inkMuted;
  const label = status.connected ? (syncing ? 'Syncing' : 'Synced') : 'Offline';
  return (
    <View style={styles.syncWrap} accessibilityLabel={`Sync status: ${label}`}>
      <View style={[styles.syncDot, { backgroundColor: color }]} />
      <Text style={styles.syncLabel}>{label}</Text>
    </View>
  );
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

  // Multi-select (long-press to enter; empty set = normal mode).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const selecting = selected.size > 0;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkResolve(kind: 'used' | 'remove') {
    if (bulkBusy || selected.size === 0) return;
    setBulkBusy(true);
    try {
      const targets = items.filter((i) => selected.has(i.id));
      const db = getPowerSync();
      const now = Date.now();
      await db.writeTransaction(async (tx) => {
        for (const t of targets) {
          // Tombstone — identical to Edit Item's delete path.
          await tx.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [
            now,
            t.id,
          ]);
        }
      });
      if (kind === 'used') {
        const at = new Date().toISOString();
        await recordExpiryEvents(
          activeHouseholdId,
          targets.map((t) => ({ kind: 'used' as const, itemName: t.name, at })),
        );
      }
      setSelected(new Set());
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBulkBusy(false);
    }
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
          <View style={styles.brandRow}>
            <Text style={styles.brand}>{tokens.brandName}</Text>
            <SyncDot />
          </View>
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
      {selecting ? (
        <View style={styles.selectBar}>
          <Text style={styles.selectCount}>{selected.size} selected</Text>
          <Pressable onPress={() => bulkResolve('used')} disabled={bulkBusy} hitSlop={6}>
            <Text style={styles.selectUsed}>✓ Used</Text>
          </Pressable>
          <Pressable onPress={() => bulkResolve('remove')} disabled={bulkBusy} hitSlop={6}>
            <Text style={styles.selectRemove}>Remove</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} disabled={bulkBusy} hitSlop={6}>
            <Text style={styles.selectCancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable onPress={() => navigation.navigate('Recipes')} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Find recipes →</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('QuickAdd')} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>＋ Quick add</Text>
          </Pressable>
        </View>
      )}
      <SectionList<PantryItem, PantrySection>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PantryRow
            item={item}
            now={now}
            selected={selected.has(item.id)}
            onPress={() =>
              selecting ? toggleSelect(item.id) : navigation.navigate('EditItem', { itemId: item.id })
            }
            onLongPress={() => toggleSelect(item.id)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            section={section}
            collapsed={collapsed.has(section.title)}
            onToggle={() => toggleSection(section.title)}
            onViewAll={section.urgent ? () => navigation.navigate('ExpiringSoon') : undefined}
          />
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
  onViewAll,
}: {
  section: SectionListData<PantryItem, PantrySection>;
  collapsed: boolean;
  onToggle: () => void;
  onViewAll?: () => void;
}) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <Text style={[styles.sectionTitle, section.urgent && styles.sectionTitleUrgent]}>{section.title}</Text>
      <View style={styles.sectionRight}>
        {onViewAll && (
          <Pressable onPress={onViewAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="View all expiring items">
            <Text style={styles.sectionView}>View →</Text>
          </Pressable>
        )}
        <Text style={styles.sectionCount}>{section.count}</Text>
        <Text style={styles.sectionChevron}>{collapsed ? '▸' : '▾'}</Text>
      </View>
    </Pressable>
  );
}

function PantryRow({
  item,
  now,
  selected,
  onPress,
  onLongPress,
}: {
  item: PantryItem;
  now: Date;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const status = getExpiryStatus(item, now);
  const expiryText = formatExpiryMeta(item, now);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, selected && styles.rowSelected]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.name}>
          {selected ? '✓  ' : ''}
          {item.name}
        </Text>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3) },
  brand: { fontFamily: tokens.font.display.bold, fontSize: 28, color: tokens.color.ink, letterSpacing: -0.5 },
  syncWrap: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1), paddingTop: tokens.space(2) },
  syncDot: { width: 8, height: 8, borderRadius: 999 },
  syncLabel: { fontFamily: tokens.font.body.medium, fontSize: 11, color: tokens.color.inkMuted },
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
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(4),
    marginHorizontal: tokens.space(6),
    marginBottom: tokens.space(3),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
  },
  selectCount: { flex: 1, fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.ink },
  selectUsed: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.success },
  selectRemove: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.semantic.expiry.expired },
  selectCancel: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
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
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3) },
  sectionView: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent },
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
  rowSelected: { backgroundColor: tokens.color.accentSoft },
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
