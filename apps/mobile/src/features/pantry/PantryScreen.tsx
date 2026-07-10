/**
 * PantryScreen — reactive, STATUS-grouped view over PowerSync's local SQLite.
 *
 * Declutter redesign: items group into three color-coded status CARDS —
 * Expired (red), Use soon (amber), Fresh (green, collapsible) — instead of by
 * storage location. A horizontal zone bar (Fresh / Drinks / Shelf-stable) filters
 * which items appear. Location demotes to a per-row sub-label, and each row wears
 * a category icon (CategoryIcon; neutral fallback). The header folds the streak
 * chip, a search toggle, and the sync dot onto one line; a single "Add items"
 * button opens an add sheet (Scan / Add manually / Quick add) so the three
 * entry points stay one tap away without three permanent buttons.
 *
 * Row interactions are unchanged from the previous list:
 *   - swipe left → ✓ Used / Remove
 *   - long-press → multi-select → bulk bar
 *   - tap the fill bar → step it down; "+ List" when running low
 * "Used" records a rescue event on top of the tombstone.
 *
 * All styling pulls from theme/tokens (ADR-006).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  LayoutAnimation,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery, useStatus } from '@powersync/react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight, Plus, ScanLine, Search, SquarePen, X, Zap } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import { pantryZoneTheme, type PantryZoneFilter } from '../../theme/pantryZoneTheme';
import type { PantryZoneThemeColors } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import { rowToPantryItem } from '../../data/powersync/mapRow';
import type { PantryItemRow } from '../../data/powersync/schema';
import {
  getExpiryStatus,
  getPantryZone,
  groupIdenticalItems,
  itemMatchesPantryZone,
  PANTRY_ZONE_LABELS,
  PANTRY_ZONE_ORDER,
  type ExpiryStatus,
  type PantryItem,
  type PantryItemGroup,
} from '@breadbox/core';
import { formatExpiryMeta } from './expiryFormat';
import { CategoryIcon } from './CategoryIcon';
import { ExpiryPill } from '../../components/ExpiryPill';
import { ScreenHeader } from '../../components/ScreenHeader';
import { UndoSnackbar } from '../../components/UndoSnackbar';
import { recordExpiryEvents } from './expiryEvents';
import { useExpiryNotifications } from '../expiry/useExpiryNotifications';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { useInsights } from '../insights/useInsights';
import { PantrySearchEmptyArt } from '../../components/illustrations/PantrySearchEmptyArt';
import { addToShoppingList } from '../shopping/addToShoppingList';
import { PantryListSkeleton } from './PantryListSkeleton';
import type { TabParamList } from '../../navigation/MainTabs';
import type { RootStackParamList } from '../../../App';

type PantryNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'PantryTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const PANTRY_ZONE_FILTERS: Array<{ value: PantryZoneFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...PANTRY_ZONE_ORDER.map((value) => ({ value, label: PANTRY_ZONE_LABELS[value] })),
];

const PANTRY_QUERY =
  'SELECT * FROM pantry_items WHERE deleted = 0 AND household_id = ? ' +
  'ORDER BY (expires_at IS NULL), expires_at ASC, name ASC';

// Visual treatment per expiry status — the three color-coded cards. Soft tint
// for the card fill, the matching expiry color for the title + status dot.
const STATUS_CARD: Record<ExpiryStatus, { title: string; tint: string; accent: string }> = {
  expired: {
    title: 'Expired',
    tint: tokens.semantic.expiry.expiredSoft,
    accent: tokens.semantic.expiry.expired,
  },
  warning: {
    title: 'Use soon',
    tint: tokens.semantic.expiry.warningSoft,
    accent: tokens.semantic.expiry.warning,
  },
  fresh: {
    title: 'Fresh',
    tint: tokens.semantic.expiry.freshSoft,
    accent: tokens.color.success,
  },
};

/** Wrap items as one-group-each — used in search mode, where we don't merge so
 *  every match is individually visible and editable. */
function singletonGroups(items: PantryItem[]): PantryItemGroup[] {
  return items.map((item) => ({
    key: item.id,
    items: [item],
    representative: item,
    count: 1,
    totalQuantity: item.quantity,
  }));
}

/** Human description of a fill level for accessibility. */
function fillLabel(level: number): string {
  if (level >= 1) return 'full';
  if (level >= 0.75) return 'three-quarters full';
  if (level >= 0.5) return 'half full';
  return 'a quarter full';
}

/**
 * Live sync indicator: PowerSync status → one calm, label-free dot in the
 * header (a gentle opacity pulse while data is in flight, still otherwise).
 * State stays exposed to assistive tech via the accessibility label.
 */
function SyncDot() {
  const status = useStatus();
  const syncing = status.dataFlowStatus.uploading || status.dataFlowStatus.downloading;
  const color = status.connected
    ? syncing
      ? tokens.semantic.expiry.warning
      : tokens.color.success
    : tokens.color.inkMuted;
  const label = status.connected ? (syncing ? 'Syncing' : 'Synced') : 'Offline';
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!syncing) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [syncing, pulse]);
  return (
    <View style={styles.syncWrap} accessibilityLabel={`Sync status: ${label}`}>
      <Animated.View style={[styles.syncDot, { backgroundColor: color, opacity: pulse }]} />
    </View>
  );
}

function PantryZoneBar({
  zone,
  zoneCounts,
  onSelect,
}: {
  zone: PantryZoneFilter;
  zoneCounts: Record<PantryZoneFilter, number>;
  onSelect: (next: PantryZoneFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.zoneChips}
      style={styles.zoneScroll}
    >
      {PANTRY_ZONE_FILTERS.map((z) => {
        const selected = z.value === zone;
        const count = zoneCounts[z.value];
        const chipTheme = pantryZoneTheme(z.value);
        return (
          <Pressable
            key={z.value}
            onPress={() => onSelect(z.value)}
            style={[
              styles.zoneChip,
              { backgroundColor: chipTheme.soft },
              selected && { backgroundColor: chipTheme.accent },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${z.label}, ${count} items`}
          >
            <Text style={[styles.zoneChipTxt, { color: chipTheme.accent }, selected && { color: chipTheme.onAccent }]}>
              {z.label}
            </Text>
            {count > 0 && (
              <Text
                style={[
                  styles.zoneChipCount,
                  { color: chipTheme.accent },
                  selected && { color: chipTheme.onAccent, opacity: 0.85 },
                ]}
              >
                {count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The last resolve, held so it can be reversed from the Undo snackbar. For a
 *  "used" batch we also stash the shared occurred-at stamp + names so undo can
 *  retract the rescue events it logged (keyed on that stamp). */
interface UndoState {
  message: string;
  ids: string[];
  kind: 'used' | 'remove';
  at: string | null;
  names: string[];
  nonce: number;
}

export function PantryScreen() {
  const navigation = useNavigation<PantryNav>();
  const { activeHouseholdId, isLoading: activeLoading } = useActiveHousehold();
  const { state: authState } = useAuth();
  const authedUserId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const { insights } = useInsights(activeHouseholdId);
  // Rows whose running-low "+ List" was tapped this session (feedback state).
  const [listed, setListed] = useState<Set<string>>(new Set());
  // The most recent swipe/bulk resolve, surfaced as an Undo snackbar.
  const [undo, setUndo] = useState<UndoState | null>(null);

  const { data: rows, isLoading, error } = useQuery<PantryItemRow>(PANTRY_QUERY, [activeHouseholdId ?? '']);

  const [items, setItems] = useState<PantryItem[]>([]);
  // Animate list reshapes when the item COUNT changes (resolve/remove/add), so
  // rows ease out instead of blinking away. First emission is exempt.
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (error) {
      console.warn('[PantryScreen] reactive query error:', error);
      return;
    }
    const next = rows.map(rowToPantryItem);
    if (lastCount.current !== null && lastCount.current !== next.length) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    lastCount.current = next.length;
    setItems(next);
  }, [rows, error]);

  const [refreshing, setRefreshing] = useState(false);
  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }

  // Fresh is the only collapsible card (usually the longest).
  const [freshCollapsed, setFreshCollapsed] = useState(false);

  // Browse zones — filter the list by food type (Fresh / Staples / Drinks / …).
  const [zone, setZone] = useState<PantryZoneFilter>('fresh');

  // Search is on-demand: a header icon reveals the field (no permanent band).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Add menu (Scan / Add manually / Quick add) behind one "Add items" button.
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Multi-select (long-press to enter; empty set = normal mode).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const selecting = selected.size > 0;

  function toggleSelectGroup(ids: string[]) {
    if (ids.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  /**
   * Shared resolution path for swipe actions (single id) and the bulk bar (all
   * selected ids): tombstone in one writeTransaction; "used" also logs rescue
   * events for the savings/streak data.
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
          await tx.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [now, t.id]);
        }
      });
      // Stamp "used" batches once so undo can match (and retract) their events.
      const at = kind === 'used' ? new Date().toISOString() : null;
      if (kind === 'used' && at) {
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
      const firstName = targets[0]?.name ?? 'item';
      const n = targets.length;
      setUndo({
        message:
          kind === 'used'
            ? n === 1
              ? `${firstName} marked used`
              : `${n} items marked used`
            : n === 1
              ? `Removed ${firstName}`
              : `Removed ${n} items`,
        ids: targets.map((t) => t.id),
        kind,
        at,
        names: targets.map((t) => t.name),
        nonce: Date.now(),
      });
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reverse the last resolve: un-tombstone the items, and for a "used" batch
   * also retract the rescue events it logged (matched by the shared occurred-at
   * stamp) so an accidental swipe doesn't quietly inflate the streak/savings.
   */
  async function undoResolve() {
    if (!undo) return;
    const payload = undo;
    setUndo(null);
    try {
      const db = getPowerSync();
      const now = Date.now();
      await db.writeTransaction(async (tx) => {
        for (const id of payload.ids) {
          await tx.execute('UPDATE pantry_items SET deleted = 0, updated_at = ? WHERE id = ?', [now, id]);
        }
        if (payload.kind === 'used' && payload.at && activeHouseholdId && payload.names.length > 0) {
          const placeholders = payload.names.map(() => '?').join(', ');
          await tx.execute(
            `UPDATE activity_events SET deleted = 1, updated_at = ? ` +
              `WHERE household_id = ? AND kind = 'used' AND occurred_at = ? AND label IN (${placeholders}) AND deleted = 0`,
            [now, activeHouseholdId, payload.at, ...payload.names],
          );
        }
      });
      Haptics.selectionAsync().catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not undo', e instanceof Error ? e.message : 'Try again.');
    }
  }

  /**
   * Tap-to-cycle on a row's fill bar: steps DOWN one level (Full → ¾ → ½ → ¼)
   * then wraps back to Full. Writes ride the same PATCH path as every edit.
   */
  async function cycleFill(item: PantryItem) {
    if (busy) return;
    const current = item.fillLevel ?? 1;
    const next = current > 0.75 ? 0.75 : current > 0.5 ? 0.5 : current > 0.25 ? 0.25 : 1;
    Haptics.selectionAsync().catch(() => {});
    try {
      await getPowerSync().execute('UPDATE pantry_items SET fill_level = ?, updated_at = ? WHERE id = ?', [
        next,
        Date.now(),
        item.id,
      ]);
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  }

  /** Running-low → shopping list: dedupe-aware add with source 'low'. */
  async function addLowToList(item: PantryItem) {
    if (!authedUserId || !activeHouseholdId) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await addToShoppingList({
        householdId: activeHouseholdId,
        userId: authedUserId,
        name: item.name,
        source: 'low',
        unit: item.unit ?? null,
      });
      setListed((prev) => new Set(prev).add(item.id));
    } catch (e: unknown) {
      Alert.alert('Could not add to list', e instanceof Error ? e.message : 'Try again.');
    }
  }

  useExpiryNotifications(items, activeHouseholdId);

  const now = useMemo(() => new Date(), [items]);

  const visibleItems = useMemo(() => {
    let result = items;
    if (zone !== 'all') {
      result = result.filter((i) => itemMatchesPantryZone(i, zone));
    }
    if (isSearching) {
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(trimmedQuery) ||
          (i.brand ?? '').toLowerCase().includes(trimmedQuery),
      );
    }
    return result;
  }, [items, zone, isSearching, trimmedQuery]);

  const zoneCounts = useMemo(() => {
    const counts: Record<PantryZoneFilter, number> = {
      all: items.length,
      fresh: 0,
      drinks: 0,
      shelfStable: 0,
    };
    for (const item of items) {
      counts[getPantryZone(item)] += 1;
    }
    return counts;
  }, [items]);

  // Bucket by expiry status, then merge identical rows for display (except in
  // search, where every match should be individually visible). Items arrive
  // soonest-first, so each bucket preserves that order.
  const grouped = useMemo(() => {
    const buckets: Record<ExpiryStatus, PantryItem[]> = { expired: [], warning: [], fresh: [] };
    for (const item of visibleItems) buckets[getExpiryStatus(item, now)].push(item);
    const toGroups = (b: PantryItem[]) => (isSearching ? singletonGroups(b) : groupIdenticalItems(b));
    return {
      expired: { groups: toGroups(buckets.expired), count: buckets.expired.length },
      warning: { groups: toGroups(buckets.warning), count: buckets.warning.length },
      fresh: { groups: toGroups(buckets.fresh), count: buckets.fresh.length },
    };
  }, [visibleItems, now, isSearching]);

  if (activeLoading || !activeHouseholdId || (isLoading && items.length === 0)) {
    return (
      <SafeAreaView
        style={[styles.root, { backgroundColor: pantryZoneTheme('fresh').canvas }]}
        edges={['top', 'left', 'right']}
      >
        <PantryListSkeleton />
      </SafeAreaView>
    );
  }

  const zoneTheme = pantryZoneTheme(zone);

  const renderRows = (groups: PantryItemGroup[]) =>
    groups.map((group, index) => {
      const ids = group.items.map((i) => i.id);
      const groupSelected = group.items.every((i) => selected.has(i.id));
      return (
        <PantryGroupRow
          key={group.representative.id}
          group={group}
          now={now}
          zoneAccent={zoneTheme.accent}
          zoneSoft={zoneTheme.soft}
          selected={groupSelected}
          last={index === groups.length - 1}
          swipeEnabled={!selecting && !busy}
          onPress={() =>
            selecting
              ? toggleSelectGroup(ids)
              : navigation.navigate('EditItem', { itemId: group.representative.id })
          }
          onLongPress={() => toggleSelectGroup(ids)}
          onResolve={(kind) => resolveItems(ids, kind)}
          onCycleFill={(target) => cycleFill(target)}
          onAddToList={(target) => void addLowToList(target)}
          isListed={group.items.some((i) => listed.has(i.id))}
        />
      );
    });

  const hasAny = items.length > 0;
  const noMatches = hasAny && visibleItems.length === 0;
  const zoneEmpty = hasAny && !isSearching && zone !== 'all' && visibleItems.length === 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: zoneTheme.canvas }]} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Pantry"
        subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'}`}
        right={
          <>
            {insights.streakDays >= 1 && (
              <Pressable
                onPress={() => navigation.navigate('Insights')}
                style={styles.streakChip}
                accessibilityRole="button"
                accessibilityLabel={`${insights.streakDays} day streak — tap for details`}
              >
                <Text style={styles.streakFlame}>🔥</Text>
                <Text style={styles.streakTxt}>{insights.streakDays}</Text>
              </Pressable>
            )}
            {hasAny && (
              <Pressable
                onPress={() => setSearchOpen((o) => !o)}
                hitSlop={12}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={searchOpen ? 'Close search' : 'Search your pantry'}
              >
                <Search size={18} color={searchOpen ? zoneTheme.accent : tokens.color.inkMuted} />
              </Pressable>
            )}
            <SyncDot />
          </>
        }
      />

      {/* Exactly one control band: bulk bar (selecting) / search field / Add. */}
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
      ) : searchOpen ? (
        <View style={styles.searchWrap}>
          <Search size={15} color={tokens.color.inkMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your pantry"
            placeholderTextColor={tokens.color.inkMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search your pantry"
          />
          <Pressable
            onPress={() => {
              setQuery('');
              setSearchOpen(false);
            }}
            style={styles.searchClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <X size={18} color={tokens.color.inkMuted} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setAddMenuOpen(true)}
          style={[styles.addBtn, { backgroundColor: zoneTheme.accent }]}
          accessibilityRole="button"
          accessibilityLabel="Add items to your pantry"
        >
          <Plus size={18} color={zoneTheme.onAccent} />
          <Text style={[styles.addBtnTxt, { color: zoneTheme.onAccent }]}>Add items</Text>
        </Pressable>
      )}

      {!hasAny ? (
        <PantryEmpty onAdd={() => navigation.navigate('AddItem')} />
      ) : (
        <>
          <PantryZoneBar zone={zone} zoneCounts={zoneCounts} onSelect={setZone} />

          {noMatches ? (
            <View style={styles.emptyWrap}>
              <PantrySearchEmptyArt />
              <Text style={styles.emptyTitle}>
                {zoneEmpty ? `No ${PANTRY_ZONE_LABELS[zone].toLowerCase()} yet` : 'No matches'}
              </Text>
              <Text style={styles.emptySub}>
                {zoneEmpty
                  ? `Nothing in ${PANTRY_ZONE_LABELS[zone]} — pick another zone above or view everything.`
                  : `No match for “${query.trim()}” — try a shorter name or check another zone.`}
              </Text>
              {zoneEmpty && (
                <Pressable
                  onPress={() => setZone('all')}
                  style={[styles.emptyZoneBtn, { backgroundColor: zoneTheme.accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={`View all ${items.length} pantry items`}
                >
                  <Text style={[styles.emptyZoneBtnTxt, { color: zoneTheme.onAccent }]}>
                    View all {items.length} items
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={zoneTheme.accent} />}
            >
          {grouped.expired.count > 0 && (
            <StatusCard status="expired" count={grouped.expired.count} zoneTheme={zoneTheme}>
              {renderRows(grouped.expired.groups)}
            </StatusCard>
          )}
          {grouped.warning.count > 0 && (
            <StatusCard
              status="warning"
              count={grouped.warning.count}
              zoneTheme={zoneTheme}
              onCook={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('CookTab');
              }}
            >
              {renderRows(grouped.warning.groups)}
            </StatusCard>
          )}
          {grouped.fresh.count > 0 && (
            <StatusCard
              status="fresh"
              count={grouped.fresh.count}
              zoneTheme={zoneTheme}
              collapsed={freshCollapsed}
              onToggle={() => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
                );
                setFreshCollapsed((c) => !c);
              }}
            >
              {!freshCollapsed && renderRows(grouped.fresh.groups)}
            </StatusCard>
          )}
            </ScrollView>
          )}
        </>
      )}

      <Modal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setAddMenuOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Add to pantry</Text>
            <AddRow
              icon={<ScanLine size={20} color={tokens.color.accent} />}
              label="Scan items"
              onPress={() => {
                setAddMenuOpen(false);
                navigation.navigate('Scan');
              }}
            />
            <AddRow
              icon={<SquarePen size={20} color={tokens.color.accent} />}
              label="Add manually"
              onPress={() => {
                setAddMenuOpen(false);
                navigation.navigate('AddItem');
              }}
            />
            <AddRow
              icon={<Zap size={20} color={tokens.color.accent} />}
              label="Quick add staples"
              onPress={() => {
                setAddMenuOpen(false);
                navigation.navigate('QuickAdd');
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <UndoSnackbar
        message={undo?.message ?? null}
        nonce={undo?.nonce ?? 0}
        onUndo={() => void undoResolve()}
        onDismiss={() => setUndo(null)}
      />
    </SafeAreaView>
  );
}

function StatusCard({
  status,
  count,
  zoneTheme,
  collapsed,
  onToggle,
  onCook,
  children,
}: {
  status: ExpiryStatus;
  count: number;
  zoneTheme: PantryZoneThemeColors;
  collapsed?: boolean;
  onToggle?: () => void;
  onCook?: () => void;
  children: ReactNode;
}) {
  const meta = STATUS_CARD[status];
  const collapsible = onToggle !== undefined;
  return (
    <View style={[styles.card, { backgroundColor: meta.tint }]}>
      <Pressable
        style={styles.cardHeader}
        onPress={onToggle}
        disabled={!collapsible}
        accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityLabel={collapsible ? `${meta.title}, ${count} items, ${collapsed ? 'collapsed' : 'expanded'}` : undefined}
      >
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusDot, { backgroundColor: meta.accent }]} />
          <Text style={[styles.cardTitle, { color: meta.accent }]}>{meta.title}</Text>
          <Text style={styles.cardCount}>{count}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          {onCook && (
            <Pressable
              style={[styles.cookBtn, { backgroundColor: zoneTheme.accent }]}
              onPress={onCook}
              accessibilityRole="button"
              accessibilityLabel="Find recipes for items expiring soon"
            >
              <Text style={[styles.cookBtnTxt, { color: zoneTheme.onAccent }]}>Cook these</Text>
            </Pressable>
          )}
          {collapsible &&
            (collapsed ? (
              <ChevronRight size={16} color={meta.accent} accessibilityLabel="Expand" />
            ) : (
              <ChevronDown size={16} color={meta.accent} accessibilityLabel="Collapse" />
            ))}
        </View>
      </Pressable>
      {children}
    </View>
  );
}

function AddRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.sheetIcon}>{icon}</View>
      <Text style={styles.sheetRowTxt}>{label}</Text>
    </Pressable>
  );
}

/**
 * One row = one display group (safe-merged identical items). Status/expiry come
 * from the representative. Swipe + multi-select act on the WHOLE group. A
 * category icon sits on the left; the status itself is conveyed by the card the
 * row lives in (no per-row left bar). The expiry pill shows only for
 * warning/expired rows (Fresh stays calm).
 */
function PantryGroupRow({
  group,
  now,
  zoneAccent,
  zoneSoft,
  selected,
  last,
  swipeEnabled,
  onPress,
  onLongPress,
  onResolve,
  onCycleFill,
  onAddToList,
  isListed,
}: {
  group: PantryItemGroup;
  now: Date;
  zoneAccent: string;
  zoneSoft: string;
  selected: boolean;
  last: boolean;
  swipeEnabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onResolve: (kind: 'used' | 'remove') => void;
  onCycleFill: (item: PantryItem) => void;
  onAddToList: (item: PantryItem) => void;
  isListed: boolean;
}) {
  const rep = group.representative;
  const status = getExpiryStatus(rep, now);
  const accent = status === 'fresh' ? zoneAccent : STATUS_CARD[status].accent;
  const expiryText = formatExpiryMeta(rep, now);
  // Summed quantity; trim float noise from fractional sums (e.g. 0.1 + 0.2).
  const qty = Number.isInteger(group.totalQuantity)
    ? group.totalQuantity
    : Math.round(group.totalQuantity * 100) / 100;
  // Count pips: a glanceable dot-per-item for countable stock — whole counts of
  // 2–12 with a count unit (ct) or none. Hidden from screen readers (the "N ct"
  // text already carries the value).
  const showPips =
    (rep.unit == null || rep.unit === 'ct') && Number.isInteger(qty) && qty >= 2 && qty <= 12;
  return (
    <Swipeable
      enabled={swipeEnabled}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <Pressable
            style={[styles.swipeBtn, styles.swipeUsed]}
            onPress={() => onResolve('used')}
            accessibilityRole="button"
            accessibilityLabel={group.count > 1 ? `Mark ${group.count} ${rep.name} used` : `Mark ${rep.name} used`}
          >
            <Text style={styles.swipeTxt}>✓ Used</Text>
          </Pressable>
          <Pressable
            style={[styles.swipeBtn, styles.swipeRemove]}
            onPress={() => onResolve('remove')}
            accessibilityRole="button"
            accessibilityLabel={group.count > 1 ? `Remove ${group.count} ${rep.name}` : `Remove ${rep.name}`}
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
          last && styles.rowLast,
          pressed && styles.rowPressed,
          selected && { backgroundColor: zoneSoft },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: zoneSoft }]}>
          <CategoryIcon category={rep.category} size={18} color={accent} />
        </View>
        <View style={styles.rowMain}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {selected ? '✓  ' : ''}
              {rep.name}
            </Text>
            {group.count > 1 && (
              <View style={[styles.countChip, { backgroundColor: zoneSoft }]} accessibilityLabel={`${group.count} entries`}>
                <Text style={[styles.countChipText, { color: zoneAccent }]}>×{group.count}</Text>
              </View>
            )}
          </View>
          {showPips && (
            <View style={styles.pipsRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: qty }).map((_, i) => (
                <View key={i} style={styles.pip} />
              ))}
            </View>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {qty}
              {rep.unit ? ` ${rep.unit}` : ''}
              {rep.location ? ` · ${rep.location}` : ''}
              {rep.brand ? ` · ${rep.brand}` : ''}
            </Text>
            {rep.fillLevel !== undefined && group.count === 1 && (
              <Pressable
                onPress={() => onCycleFill(rep)}
                hitSlop={8}
                pointerEvents={swipeEnabled ? 'auto' : 'none'}
                accessibilityRole="button"
                accessibilityLabel={`${rep.name} ${fillLabel(rep.fillLevel)} — tap to set lower`}
                style={styles.fillTrack}
              >
                <View
                  style={[
                    styles.fillBar,
                    { width: Math.max(3, Math.round(44 * rep.fillLevel)), backgroundColor: zoneAccent },
                    rep.fillLevel <= 0.25 && styles.fillBarLow,
                  ]}
                />
              </Pressable>
            )}
            {rep.fillLevel !== undefined && rep.fillLevel <= 0.25 && group.count === 1 && (
              <Pressable
                onPress={() => onAddToList(rep)}
                hitSlop={6}
                disabled={isListed}
                pointerEvents={swipeEnabled ? 'auto' : 'none'}
                accessibilityRole="button"
                accessibilityLabel={isListed ? `${rep.name} is on the shopping list` : `Add ${rep.name} to the shopping list`}
                style={[styles.listChip, isListed && { borderColor: zoneSoft, backgroundColor: zoneSoft }]}
              >
                <Text style={[styles.listChipTxt, { color: zoneAccent }, isListed && styles.listChipTxtDone]}>
                  {isListed ? '✓ Listed' : '+ List'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        {status !== 'fresh' && expiryText !== undefined && <ExpiryPill status={status} label={expiryText} />}
      </Pressable>
    </Swipeable>
  );
}

function PantryEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Fresh start</Text>
      <Text style={styles.emptySub}>Scan a barcode, snap a receipt, or add something by hand — we'll handle the rest.</Text>
      <Pressable style={styles.emptyBtn} onPress={onAdd}>
        <Text style={styles.emptyBtnText}>Let's stock up</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: tokens.space(2),
    backgroundColor: tokens.color.accentSoft,
    borderRadius: 999,
  },
  streakFlame: { fontSize: 12 },
  streakTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent, fontVariant: ['tabular-nums'] },
  iconBtn: { padding: 2 },
  syncWrap: { alignItems: 'center', justifyContent: 'center' },
  syncDot: { width: 10, height: 10, borderRadius: 999 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(2),
    marginHorizontal: tokens.space(6),
    marginBottom: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
  },
  addBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15 },
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
  searchInput: { flex: 1, paddingVertical: tokens.space(1), fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.ink },
  // The close X needs a real tap target (44pt with hitSlop) — a bare 15px icon
  // at the top of the screen missed most taps.
  searchClose: { padding: tokens.space(1.5), margin: -tokens.space(1.5) },
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
  zoneScroll: { flexGrow: 0, marginBottom: tokens.space(2) },
  zoneChips: {
    flexDirection: 'row',
    gap: tokens.space(2),
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(1),
  },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
  },
  // Explicit lineHeight: Nunito Sans clips vertically on iOS without it —
  // invisible on the soft chip fill, obvious once a selected chip goes accent.
  zoneChipTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, lineHeight: 18 },
  zoneChipCount: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  scroll: { paddingBottom: tokens.space(10) },
  card: {
    marginHorizontal: tokens.space(6),
    marginBottom: tokens.space(4),
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(4),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(2),
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3) },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  cardTitle: { fontFamily: tokens.font.body.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  cardCount: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted, fontVariant: ['tabular-nums'] },
  cookBtn: {
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: tokens.radius.sm,
  },
  cookBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: tokens.space(3),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space(4),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
    backgroundColor: 'transparent',
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: tokens.color.surfaceAlt },
  rowMain: { flex: 1, marginRight: tokens.space(3) },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  name: { flexShrink: 1, fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  countChip: { borderRadius: tokens.radius.sm, paddingHorizontal: tokens.space(2), paddingVertical: 1 },
  countChipText: { fontFamily: tokens.font.body.semibold, fontSize: 11, fontVariant: ['tabular-nums'] },
  pipsRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
  pip: { width: 5, height: 5, borderRadius: 999, backgroundColor: tokens.color.inkMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2), marginTop: 2 },
  meta: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
  fillTrack: { width: 44, height: 6, borderRadius: 999, backgroundColor: tokens.color.line, overflow: 'hidden' },
  fillBar: { height: 6, borderRadius: 999 },
  fillBarLow: { backgroundColor: tokens.semantic.expiry.warning },
  listChip: { paddingVertical: 2, paddingHorizontal: tokens.space(2), borderRadius: 999, borderWidth: 1, borderColor: tokens.color.line },
  listChipTxt: { fontFamily: tokens.font.body.semibold, fontSize: 11 },
  listChipTxtDone: { opacity: 0.85 },
  swipeActions: { flexDirection: 'row' },
  swipeBtn: { justifyContent: 'center', paddingHorizontal: tokens.space(4) },
  swipeUsed: { backgroundColor: tokens.color.success },
  swipeRemove: { backgroundColor: tokens.semantic.expiry.expired },
  swipeTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.onAccent },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(10),
  },
  sheetTitle: { fontFamily: tokens.font.display.semibold, fontSize: 18, color: tokens.color.ink, marginBottom: tokens.space(3) },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(4), paddingVertical: tokens.space(4) },
  sheetRowPressed: { opacity: 0.6 },
  sheetIcon: { width: 28, alignItems: 'center' },
  sheetRowTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
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
  emptyZoneBtn: {
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(6),
    borderRadius: tokens.radius.md,
  },
  emptyZoneBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15 },
  emptyBtn: { backgroundColor: tokens.color.accent, paddingVertical: tokens.space(3), paddingHorizontal: tokens.space(6), borderRadius: tokens.radius.md },
  emptyBtnText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
});
