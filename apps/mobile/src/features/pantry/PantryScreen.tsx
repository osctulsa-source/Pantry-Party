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
 * Phase 2: this screen is the home TAB (see navigation/MainTabs) and fully
 * self-heads — a quiet "Pantry" title plus a label-free sync dot in the top
 * corner (green synced / ochre syncing / muted offline; the accessibility
 * label still spells it out). Add item is the screen's primary action; recipe
 * browsing lives on the Cook tab, and the Use Soon card's "Cook these →"
 * switches to it with the expiry context.
 *
 * Expiry is "silenced" when it isn't actionable: the colorblind-safe <ExpiryPill>
 * shows for warning/expired items always, and as a calm preview for items within
 * SOON_PREVIEW_DAYS — everything further out (incl. shelf-stable staples) stays
 * clean. All styling pulls from theme/tokens (ADR-006).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
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
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery, useStatus } from '@powersync/react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import { rowToPantryItem } from '../../data/powersync/mapRow';
import type { PantryItemRow } from '../../data/powersync/schema';
import {
  getExpiryStatus,
  groupIdenticalItems,
  type PantryItem,
  type PantryItemGroup,
} from '@breadbox/core';
import { formatExpiryMeta, daysUntilExpiry } from './expiryFormat';
import { ExpiryPill } from '../../components/ExpiryPill';
import { recordExpiryEvents } from './expiryEvents';
import { useExpiryNotifications } from '../expiry/useExpiryNotifications';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import type { TabParamList } from '../../navigation/MainTabs';
import type { RootStackParamList } from '../../../App';

/**
 * Composite navigation: this screen lives inside the tab navigator (so it can
 * switch tabs — CookTab) but also pushes root-stack detail screens (AddItem,
 * EditItem, QuickAdd, ExpiringSoon) OVER the tab bar.
 */
type PantryNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'PantryTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

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
  count: number; // full ITEM count, even when collapsed (rows may be fewer after merge)
  data: PantryItemGroup[]; // display groups (safe-merged); empty when collapsed
}

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

function titleCase(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
 * header corner (the offline-first engine should hum in the background, not
 * occupy real estate). Motion IS the status language: a gentle opacity pulse
 * while data is in flight, dead still when settled or offline. State stays
 * fully exposed to assistive tech via the accessibility label.
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

export function PantryScreen() {
  const navigation = useNavigation<PantryNav>();
  const { activeHouseholdId, isLoading: activeLoading } = useActiveHousehold();

  const { data: rows, isLoading, error } = useQuery<PantryItemRow>(PANTRY_QUERY, [activeHouseholdId ?? '']);

  const [items, setItems] = useState<PantryItem[]>([]);
  // Animate list reshapes when the item COUNT changes (resolve/remove/add —
  // local or synced in from another device), so rows ease out instead of
  // blinking away. First emission is exempt (no entrance animation on load);
  // searching/collapsing don't pass through here, so they stay instant.
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

  // A merged row represents N underlying records; selection is all-or-nothing
  // across the group so bulk actions (and the swipe path) stay consistent.
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

  /**
   * Tap-to-cycle on a row's fill bar: steps DOWN one level (Full → ¾ → ½ → ¼)
   * then wraps back to Full — matching consumption, with recovery one more tap
   * away. Writes ride the same PATCH path as every other edit.
   */
  async function cycleFill(item: PantryItem) {
    if (busy) return;
    const current = item.fillLevel ?? 1;
    const next = current > 0.75 ? 0.75 : current > 0.5 ? 0.5 : current > 0.25 ? 0.25 : 1;
    Haptics.selectionAsync().catch(() => {});
    try {
      await getPowerSync().execute(
        'UPDATE pantry_items SET fill_level = ?, updated_at = ? WHERE id = ?',
        [next, Date.now(), item.id],
      );
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
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

    // Merge identical rows for display — but not while searching, where every
    // match should be individually visible/editable.
    const toGroups = (bucket: PantryItem[]) =>
      isSearching ? singletonGroups(bucket) : groupIdenticalItems(bucket);

    const out: PantrySection[] = [];
    if (urgent.length > 0) {
      out.push({ title: 'Use soon', urgent: true, count: urgent.length, data: collapsed.has('Use soon') && !isSearching ? [] : toGroups(urgent) });
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
      out.push({ title, urgent: false, count: bucket.length, data: collapsed.has(title) && !isSearching ? [] : toGroups(bucket) });
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
          <Text style={styles.title}>Pantry</Text>
          <Text style={styles.count}>
            {items.length} {items.length === 1 ? 'item' : 'items'} in your pantry
          </Text>
        </View>
        <SyncDot />
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
            onPress={() => navigation.navigate('AddItem')}
            style={[styles.actionBtn, styles.actionPrimary]}
            accessibilityRole="button"
            accessibilityLabel="Add an item to your pantry"
          >
            <Text style={[styles.actionText, styles.actionTextPrimary]}>＋ Add item</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('QuickAdd')}
            style={[styles.actionBtn, styles.actionGhost]}
            accessibilityRole="button"
            accessibilityLabel="Quick add staples"
          >
            <Text style={[styles.actionText, styles.actionTextGhost]}>Quick add</Text>
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
      <SectionList<PantryItemGroup, PantrySection>
        sections={sections}
        keyExtractor={(group) => group.representative.id}
        renderItem={({ item: group }) => {
          const ids = group.items.map((i) => i.id);
          const groupSelected = group.items.every((i) => selected.has(i.id));
          return (
            <PantryGroupRow
              group={group}
              now={now}
              selected={groupSelected}
              swipeEnabled={!selecting && !busy}
              onPress={() =>
                selecting
                  ? toggleSelectGroup(ids)
                  : navigation.navigate('EditItem', { itemId: group.representative.id })
              }
              onLongPress={() => toggleSelectGroup(ids)}
              onResolve={(kind) => resolveItems(ids, kind)}
              onCycleFill={(target) => cycleFill(target)}
            />
          );
        }}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            section={section}
            collapsed={collapsed.has(section.title)}
            onToggle={() => toggleSection(section.title)}
            onCook={
              section.urgent
                ? () => {
                    // Light impact — this is the differentiator moment (expiry → cook).
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    navigation.navigate('CookTab');
                  }
                : undefined
            }
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
  section: SectionListData<PantryItemGroup, PantrySection>;
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

/**
 * One row = one display group (safe-merged identical items). Status/expiry come
 * from the representative (all members share the same date by construction).
 * Swipe + multi-select act on the WHOLE group: resolving "used"/"remove" hits
 * every underlying record, and selection toggles all member ids together.
 *
 * v1 limitation: tap-to-edit opens the representative record. Members are
 * identical in every displayed field, so this is well-defined for all of them
 * except per-record quantity; editing the date/name/unit of the representative
 * naturally splits it back out of the group.
 */
function PantryGroupRow({
  group,
  now,
  selected,
  swipeEnabled,
  onPress,
  onLongPress,
  onResolve,
  onCycleFill,
}: {
  group: PantryItemGroup;
  now: Date;
  selected: boolean;
  swipeEnabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onResolve: (kind: 'used' | 'remove') => void;
  onCycleFill: (item: PantryItem) => void;
}) {
  const rep = group.representative;
  const status = getExpiryStatus(rep, now);
  const expiryText = formatExpiryMeta(rep, now);
  const days = daysUntilExpiry(rep, now);
  // Silence far-out timelines: pill shows for warning/expired always, plus a
  // calm preview while within SOON_PREVIEW_DAYS. Everything else (incl. undated
  // staples) renders no pill. The `expiryText !== undefined` guard at the JSX
  // site narrows the label to string for strict TS.
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
  // Summed quantity; trim float noise from fractional sums (e.g. 0.1 + 0.2).
  const qty = Number.isInteger(group.totalQuantity)
    ? group.totalQuantity
    : Math.round(group.totalQuantity * 100) / 100;
  // Count pips: a glanceable dot-per-item for countable stock (eggs, cans) —
  // whole counts of 2–12 with a count unit (ct) or none. Deliberately neutral
  // and denominator-free: without knowing the starting count, "low" can't be
  // inferred honestly (1 jar ≠ last egg) — the running-low signal arrives
  // with fill_level. Pips are hidden from screen readers (the "N ct" text
  // already carries the value).
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
          barColor ? { borderLeftWidth: 3, borderLeftColor: barColor } : null,
          pressed && styles.rowPressed,
          selected && styles.rowSelected,
        ]}
      >
        <View style={styles.rowMain}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {selected ? '✓  ' : ''}
              {rep.name}
            </Text>
            {group.count > 1 && (
              <View style={styles.countChip} accessibilityLabel={`${group.count} entries`}>
                <Text style={styles.countChipText}>×{group.count}</Text>
              </View>
            )}
          </View>
          {showPips && (
            <View
              style={styles.pipsRow}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
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
              // Mini fill bar — single continuous items only (a merged stack's
              // "fullness" is its count; pips' job). Tap steps the level down.
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
                    { width: Math.max(3, Math.round(44 * rep.fillLevel)) },
                    rep.fillLevel <= 0.25 && styles.fillBarLow,
                  ]}
                />
              </Pressable>
            )}
          </View>
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
  title: { fontFamily: tokens.font.display.bold, fontSize: 28, color: tokens.color.ink, letterSpacing: -0.5 },
  syncWrap: { paddingTop: tokens.space(3), paddingLeft: tokens.space(3) },
  syncDot: { width: 10, height: 10, borderRadius: 999 },
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  name: { flexShrink: 1, fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  countChip: {
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space(2),
    paddingVertical: 1,
  },
  countChipText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    color: tokens.color.accent,
    fontVariant: ['tabular-nums'],
  },
  pipsRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
  pip: { width: 5, height: 5, borderRadius: 999, backgroundColor: tokens.color.inkMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2), marginTop: 2 },
  meta: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
  fillTrack: {
    width: 44,
    height: 6,
    borderRadius: 999,
    backgroundColor: tokens.color.line,
    overflow: 'hidden',
  },
  fillBar: { height: 6, borderRadius: 999, backgroundColor: tokens.color.accent },
  fillBarLow: { backgroundColor: tokens.semantic.expiry.warning },
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
