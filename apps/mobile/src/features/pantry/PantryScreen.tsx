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
 * The "Use soon" section reads as a distinct soft-warning CARD: a tinted sticky
 * header carrying a primary "Cook these →" CTA (into the recipe surface) plus a
 * "Triage all" link to ExpiringSoonScreen, and its rows wear a status-colored
 * left bar so the urgent block is unmissable the second the app opens.
 *
 * Sections collapse on header tap (in-memory state). Two row-level resolution
 * paths share one write helper:
 *   - swipe a row left (gesture-handler Swipeable) → ✓ Used / Remove
 *   - long-press → multi-select → bulk bar (✓ Used / Remove / Cancel)
 * "Used" records a rescue event (expiryEvents) on top of the tombstone; swipe
 * is disabled while selecting so the gestures don't fight.
 *
 * The header shows a sync dot driven by PowerSync's live status (green synced /
 * ochre syncing / muted offline) — sync failures stop being invisible.
 *
 * Expiry is "silenced" when it isn't actionable: the colorblind-safe <ExpiryPill>
 * shows for warning/expired items always, and as a calm preview for items within
 * SOON_PREVIEW_DAYS — everything further out (incl. shelf-stable staples) stays
 * clean. All styling pulls from theme/tokens (ADR-006).
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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useStatus } from '@powersync/react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import type { PantryItemRow } from '../../data/powersync/schema';
import { getExpiryStatus, parsePantryItem, type PantryItem } from '@breadbox/core';
import { formatExpiryMeta, daysUntilExpiry } from './expiryFormat';
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

// Items further out than this (and not already warning/expired) show no expiry
// pill — a 361-day staple shouldn't shout a countdown. ~2 weeks gives a calm
// heads-up window before the warning ramp (DEFAULT_EXPIRY_WARNING_DAYS) kicks in.
const SOON_PREVIEW_DAYS = 14;

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

  // Search (name or brand, case-insensitive). Searching ignores collapsed
  // state — a match hidden inside a collapsed section would read as missing.
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Multi-select (long-press to enter; empty set = normal mode).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const selecting = selected.size > 0;

  function toggleSelect(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Shared resolution path for swipe actions (single id) and the bulk bar
   * (all selected ids): tombstone in one writeTransaction; "used" also logs
   * rescue events for the savings/streak data.
   */
  async function resolveItems(ids: string[], kind: 'used' | 'remove') {
    if (busy || ids.length === 0) return;
    setBusy(true);
    try {
      const targets = items.filter((i) => ids.includes(i.id));
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
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  useExpiryNotifications(items);

  const now = useMemo(() => new Date(), [items]);

  const visibleItems = useMemo(
    () =>
      isSearching
        ? items.filter(
            (i) =>
              i.name.toLowerCase().includes(trimmedQuery) ||
              (i.brand ?? '').toLowerCase().includes(trimmedQuery),
          )
        : items,
    [items, isSearching, trimmedQuery],
  );

  // Build sections: "Use soon" (urgent, exclusive) + one per location. Items
  // arrive already soonest-first, so each bucket preserves that order.
  const sections = useMemo<PantrySection[]>(() => {
    const urgent: PantryItem[] = [];
    const byLocation = new Map<string, PantryItem[]>();
    for (const item of visibleItems) {
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
      out.push({ title: 'Use soon', urgent: true, count: urgent.length, data: collapsed.has('Use soon') && !isSearching ? [] : urgent });
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
      out.push({ title, urgent: false, count: bucket.length, data: collapsed.has(title) && !isSearching ? [] : bucket });
    }
    return out;
  }, [visibleItems, now, collapsed, isSearching]);

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
      {selecting ? (
        <View style={styles.selectBar}>
          <Text style={styles.selectCount}>{selected.size} selected</Text>
          <Pressable onPress={() => resolveItems([...selected], 'used')} disabled={busy} hitSlop={6}>
            <Text style={styles.selectUsed}>✓ Used</Text>
          </Pressable>
          <Pressable onPress={() => resolveItems([...selected], 'remove')} disabled={busy} hitSlop={6}>
            <Text style={styles.selectRemove}>Remove</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} disabled={busy} hitSlop={6}>
            <Text style={styles.selectCancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => navigation.navigate('Recipes')}
            style={[styles.actionBtn, styles.actionPrimary]}
            accessibilityRole="button"
            accessibilityLabel="Find recipes from your pantry"
          >
            <Text style={[styles.actionText, styles.actionTextPrimary]}>Find recipes →</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('QuickAdd')}
            style={[styles.actionBtn, styles.actionGhost]}
            accessibilityRole="button"
            accessibilityLabel="Quick add staples"
          >
            <Text style={[styles.actionText, styles.actionTextGhost]}>＋ Quick add</Text>
          </Pressable>
        </View>
      )}
      {items.length > 0 && (
        <View style={styles.searchWrap}>
          <Search size={15} color={tokens.color.inkMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your pantry"
            placeholderTextColor={tokens.color.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search your pantry"
          />
          {isSearching && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={15} color={tokens.color.inkMuted} />
            </Pressable>
          )}
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
            swipeEnabled={!selecting && !busy}
            onPress={() =>
              selecting ? toggleSelect(item.id) : navigation.navigate('EditItem', { itemId: item.id })
            }
            onLongPress={() => toggleSelect(item.id)}
            onResolve={(target, kind) => resolveItems([target.id], kind)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            section={section}
            collapsed={collapsed.has(section.title)}
            onToggle={() => toggleSection(section.title)}
            onCook={section.urgent ? () => navigation.navigate('Recipes') : undefined}
            onViewAll={section.urgent ? () => navigation.navigate('ExpiringSoon') : undefined}
          />
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={items.length === 0 || visibleItems.length === 0 ? styles.listEmpty : styles.list}
        ListEmptyComponent={
          items.length === 0 ? (
            <PantryEmpty onAdd={() => navigation.navigate('AddItem')} />
          ) : visibleItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptySub}>Nothing in your pantry matches “{query.trim()}”.</Text>
            </View>
          ) : undefined
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.accent} />}
      />
    </SafeAreaView>
  );
}

function SectionHeader({
  section,
  collapsed,
  onToggle,
  onCook,
  onViewAll,
}: {
  section: SectionListData<PantryItem, PantrySection>;
  collapsed: boolean;
  onToggle: () => void;
  onCook?: () => void;
  onViewAll?: () => void;
}) {
  const urgent = section.urgent;
  return (
    <View style={[styles.sectionHeaderWrap, urgent && styles.sectionHeaderUrgent]}>
      <Pressable style={styles.sectionHeaderTop} onPress={onToggle}>
        <Text style={[styles.sectionTitle, urgent && styles.sectionTitleUrgent]}>{section.title}</Text>
        <View style={styles.sectionRight}>
          <Text style={[styles.sectionCount, urgent && styles.sectionCountUrgent]}>{section.count}</Text>
          {collapsed ? (
            <ChevronRight size={15} color={tokens.color.inkMuted} accessibilityLabel="Expand section" />
          ) : (
            <ChevronDown size={15} color={tokens.color.inkMuted} accessibilityLabel="Collapse section" />
          )}
        </View>
      </Pressable>
      {urgent && !collapsed && (
        <View style={styles.useSoonCta}>
          {onCook && (
            <Pressable
              style={styles.cookBtn}
              onPress={onCook}
              accessibilityRole="button"
              accessibilityLabel="Find recipes for items expiring soon"
            >
              <Text style={styles.cookBtnText}>Cook these →</Text>
            </Pressable>
          )}
          {onViewAll && (
            <Pressable onPress={onViewAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Triage all expiring items">
              <Text style={styles.triageLink}>Triage all</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function PantryRow({
  item,
  now,
  selected,
  swipeEnabled,
  onPress,
  onLongPress,
  onResolve,
}: {
  item: PantryItem;
  now: Date;
  selected: boolean;
  swipeEnabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onResolve: (item: PantryItem, kind: 'used' | 'remove') => void;
}) {
  const status = getExpiryStatus(item, now);
  const expiryText = formatExpiryMeta(item, now);
  const days = daysUntilExpiry(item, now);
  // Silence far-out timelines: pill shows for warning/expired always, plus a
  // calm preview while an item is within SOON_PREVIEW_DAYS. Everything else
  // (incl. undated staples) renders no pill. The `expiryText !== undefined`
  // guard at the JSX site narrows the label to string for strict TS.
  const withinSoonWindow =
    status !== 'fresh' || (days !== undefined && days <= SOON_PREVIEW_DAYS);
  // Urgent rows get a status-colored left bar so the "Use soon" block reads as
  // one contiguous card (fresh rows have no bar).
  const barColor =
    status === 'expired'
      ? tokens.semantic.expiry.expired
      : status === 'warning'
        ? tokens.semantic.expiry.warning
        : undefined;
  return (
    <Swipeable
      enabled={swipeEnabled}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <Pressable
            style={[styles.swipeBtn, styles.swipeUsed]}
            onPress={() => onResolve(item, 'used')}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.name} used`}
          >
            <Text style={styles.swipeTxt}>✓ Used</Text>
          </Pressable>
          <Pressable
            style={[styles.swipeBtn, styles.swipeRemove]}
            onPress={() => onResolve(item, 'remove')}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
          >
            <Text style={styles.swipeTxt}>Remove</Text>
          </Pressable>
        </View>
      )}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.row,
          barColor ? { borderLeftWidth: 3, borderLeftColor: barColor } : null,
          pressed && styles.rowPressed,
          selected && styles.rowSelected,
        ]}
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
        {expiryText !== undefined && withinSoonWindow && (
          <ExpiryPill status={status} label={expiryText} />
        )}
      </Pressable>
    </Swipeable>
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
  actionRow: { flexDirection: 'row', gap: tokens.space(3), marginHorizontal: tokens.space(6), marginBottom: tokens.space(3) },
  actionBtn: {
    flex: 1,
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: tokens.color.accent },
  actionGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: tokens.color.line },
  actionText: { fontFamily: tokens.font.body.semibold, fontSize: 14 },
  actionTextPrimary: { color: tokens.color.onAccent },
  actionTextGhost: { color: tokens.color.accent },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(2),
    marginHorizontal: tokens.space(6),
    marginBottom: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    paddingVertical: tokens.space(2),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: tokens.space(1),
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
  },
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
  sectionHeaderWrap: {
    backgroundColor: tokens.color.surface, // opaque so sticky headers don't show rows through
  },
  sectionHeaderUrgent: { backgroundColor: tokens.color.warnSoft },
  sectionHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(2),
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
  sectionCount: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted, fontVariant: ['tabular-nums'] },
  sectionCountUrgent: { color: tokens.semantic.expiry.warning },
  useSoonCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(4),
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(1),
    paddingBottom: tokens.space(3),
  },
  cookBtn: {
    backgroundColor: tokens.color.accent,
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.sm,
  },
  cookBtnText: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.onAccent },
  triageLink: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
    backgroundColor: tokens.color.surface, // opaque so swipe actions hide when closed
  },
  rowPressed: { backgroundColor: tokens.color.surfaceAlt },
  rowSelected: { backgroundColor: tokens.color.accentSoft },
  rowMain: { flex: 1, marginRight: tokens.space(3) },
  name: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  meta: { marginTop: 2, fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
  swipeActions: { flexDirection: 'row' },
  swipeBtn: { justifyContent: 'center', paddingHorizontal: tokens.space(4) },
  swipeUsed: { backgroundColor: tokens.color.success },
  swipeRemove: { backgroundColor: tokens.semantic.expiry.expired },
  swipeTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.onAccent },
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
