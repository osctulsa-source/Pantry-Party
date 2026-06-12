/**
 * ExpiringSoonScreen — the focused "deal with it" view (July quick-strike).
 *
 * The pantry list's pinned "Use soon" section is great for awareness but bad
 * for action: in a 60-item pantry the urgent five sit at the top of a long
 * scroll with no per-item resolution. This screen is the tap-through from
 * that section header — only warning/expired items, soonest first, each with
 * a one-tap outcome:
 *
 *   Used   → tombstone + 'used' expiry event (a rescue — streak fuel)
 *   Tossed → tombstone + 'tossed' expiry event (honest waste data)
 *   +2d    → snooze: push expires_at to two days from TODAY (not from the old
 *            date — an item that expired last week should re-surface the day
 *            after tomorrow, not stay buried in the past)
 *
 * Reactive via useQuery — resolved rows ease out live (rows animate via
 * LayoutAnimation when the urgent count changes; Phase 3 motion pass). Events
 * feed the November motivation arc (savings math, positive-action streak).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react-native';
import * as Haptics from 'expo-haptics';

import { addDaysUTC, getExpiryStatus, parsePantryItem, type PantryItem } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import type { PantryItemRow } from '../../data/powersync/schema';
import { ExpiryPill } from '../../components/ExpiryPill';
import { formatExpiryMeta } from './expiryFormat';
import { recordExpiryEvents, type ExpiryEventKind } from './expiryEvents';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';

const QUERY =
  'SELECT * FROM pantry_items WHERE deleted = 0 AND household_id = ? ' +
  'ORDER BY (expires_at IS NULL), expires_at ASC, name ASC';

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

export function ExpiringSoonScreen() {
  const { activeHouseholdId } = useActiveHousehold();
  const { data: rows } = useQuery<PantryItemRow>(QUERY, [activeHouseholdId ?? '']);
  const [busyId, setBusyId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), [rows]);
  const urgent = useMemo(
    () => rows.map(rowToPantryItem).filter((i) => getExpiryStatus(i, now) !== 'fresh'),
    [rows, now],
  );

  // Resolved/snoozed rows ease out instead of blinking away (Phase 3 motion
  // pass). Keyed on the urgent COUNT; first emission exempt so the initial
  // list doesn't play an entrance animation.
  const lastUrgentCount = useRef<number | null>(null);
  useEffect(() => {
    if (lastUrgentCount.current !== null && lastUrgentCount.current !== urgent.length) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    lastUrgentCount.current = urgent.length;
  }, [urgent]);

  async function resolve(item: PantryItem, kind: ExpiryEventKind) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const db = getPowerSync();
      // Same tombstone path as Edit Item's delete — PantryScreen's
      // `deleted = 0` filter (and this screen's) hides it everywhere.
      await db.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [
        Date.now(),
        item.id,
      ]);
      await recordExpiryEvents(activeHouseholdId, [
        { kind, itemName: item.name, at: new Date().toISOString() },
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function snooze(item: PantryItem) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const db = getPowerSync();
      const newExpiry = addDaysUTC(new Date(), 2).toISOString();
      await db.execute('UPDATE pantry_items SET expires_at = ?, updated_at = ? WHERE id = ?', [
        newExpiry,
        Date.now(),
        item.id,
      ]);
      Haptics.selectionAsync().catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not snooze', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={urgent}
        keyExtractor={(i) => i.id}
        contentContainerStyle={urgent.length === 0 ? styles.listEmpty : styles.list}
        ListHeaderComponent={
          urgent.length > 0 ? (
            <Text style={styles.hint}>
              One tap per item — Used logs a rescue, Tossed keeps the waste math honest, +2d
              snoozes the reminder.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Nothing needs attention</Text>
            <Text style={styles.emptySub}>Everything in your pantry is still fresh. Nice.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = getExpiryStatus(item, now);
          const meta = formatExpiryMeta(item, now);
          const busy = busyId === item.id;
          return (
            <View style={[styles.row, busy && styles.rowBusy]}>
              <View style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ''}
                    {item.location ? ` · ${item.location}` : ''}
                  </Text>
                  {meta ? <ExpiryPill status={status} label={meta} /> : null}
                </View>
              </View>
              <View style={styles.actions}>
                <Action label="✓ Used" tone="good" disabled={busy} onPress={() => resolve(item, 'used')} />
                <Action label="Tossed" tone="bad" disabled={busy} onPress={() => resolve(item, 'tossed')} />
                <Action label="+2d" tone="neutral" disabled={busy} onPress={() => snooze(item)} />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Action({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: 'good' | 'bad' | 'neutral';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.actBtn, pressed && styles.actBtnPressed, disabled && styles.actBtnDisabled]}
    >
      <Text
        style={[
          styles.actTxt,
          tone === 'good' && { color: tokens.color.success },
          tone === 'bad' && { color: tokens.semantic.expiry.expired },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  list: { paddingBottom: tokens.space(8) },
  listEmpty: { flexGrow: 1 },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12.5,
    color: tokens.color.inkMuted,
    lineHeight: 17,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(2),
  },
  row: {
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowBusy: { opacity: 0.5 },
  rowMain: { marginBottom: tokens.space(2) },
  name: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: tokens.space(3),
  },
  meta: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
  actions: { flexDirection: 'row', gap: tokens.space(2) },
  actBtn: {
    flex: 1,
    paddingVertical: tokens.space(2),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    alignItems: 'center',
  },
  actBtnPressed: { backgroundColor: tokens.color.surfaceAlt },
  actBtnDisabled: { opacity: 0.5 },
  actTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.ink },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 20,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
  },
  emptySub: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, textAlign: 'center' },
});
