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
 *
 * Delight polish: a header now leads with a live urgency count + expired/
 * expiring-soon breakdown (ticks down as items resolve); the three actions are
 * tone-tinted with lucide icons (Used = green check, Tossed = red trash,
 * +2d = clock); and the all-clear state is branded with the Breadbox mark.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { Check, ChefHat, Clock, Trash2 } from 'lucide-react-native';

import { addDaysUTC, getExpiryStatus, type PantryItem } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import { rowToPantryItem } from '../../data/powersync/mapRow';
import type { PantryItemRow } from '../../data/powersync/schema';
import { ExpiryPill } from '../../components/ExpiryPill';
import { BrandMark } from '../../components/BrandMark';
import { formatExpiryMeta } from './expiryFormat';
import { recordExpiryEvents, type ExpiryEventKind } from './expiryEvents';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import type { RootStackParamList } from '../../../App';

const QUERY =
  'SELECT * FROM pantry_items WHERE deleted = 0 AND household_id = ? ' +
  'ORDER BY (expires_at IS NULL), expires_at ASC, name ASC';

export function ExpiringSoonScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeHouseholdId } = useActiveHousehold();
  const { data: rows } = useQuery<PantryItemRow>(QUERY, [activeHouseholdId ?? '']);
  const [busyId, setBusyId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), [rows]);
  const urgent = useMemo(
    () => rows.map(rowToPantryItem).filter((i) => getExpiryStatus(i, now) !== 'fresh'),
    [rows, now],
  );

  // Split the urgent set for the header summary. Anything not 'expired' is
  // counted as "expiring soon" (whatever the warning status is named), so the
  // breakdown stays correct without coupling to the exact status vocabulary.
  const expiredCount = useMemo(
    () => urgent.filter((i) => getExpiryStatus(i, now) === 'expired').length,
    [urgent, now],
  );
  const soonCount = urgent.length - expiredCount;
  const breakdownParts: string[] = [];
  if (expiredCount > 0) breakdownParts.push(`${expiredCount} expired`);
  if (soonCount > 0) breakdownParts.push(`${soonCount} expiring soon`);
  const breakdown = breakdownParts.join('  ·  ');

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
            <View style={styles.header}>
              <Text style={styles.headerCount}>
                {urgent.length} {urgent.length === 1 ? 'item needs attention' : 'items need attention'}
              </Text>
              {breakdown ? <Text style={styles.headerBreakdown}>{breakdown}</Text> : null}
              <Text style={styles.hint}>
                One tap per item. Used it? That's a rescue. Tossed it? Honest data helps. Not ready?
                Snooze it.
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <BrandMark size={64} />
            <Text style={styles.emptyTitle}>Everything's fresh</Text>
            <Text style={styles.emptySub}>Nothing expiring soon — you're on top of it 🎉</Text>
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
                <Action
                  label="Recipes"
                  tone="cook"
                  disabled={busy}
                  accessibilityLabel={`Find recipes using ${item.name}`}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    navigation.navigate('MainTabs', {
                      screen: 'CookTab',
                      params: { focus: 'useItUp', ingredient: item.name },
                    });
                  }}
                />
                <Action label="Used" tone="good" disabled={busy} onPress={() => resolve(item, 'used')} />
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
  accessibilityLabel,
}: {
  label: string;
  tone: 'good' | 'bad' | 'neutral' | 'cook';
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const toneColor =
    tone === 'good'
      ? tokens.color.success
      : tone === 'bad'
        ? tokens.semantic.expiry.expired
        : tone === 'cook'
          ? tokens.color.accent
          : tokens.color.inkMuted;
  const borderColor = tone === 'neutral' ? tokens.color.line : toneColor;
  const Icon =
    tone === 'good' ? Check : tone === 'bad' ? Trash2 : tone === 'cook' ? ChefHat : Clock;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.actBtn,
        { borderColor },
        pressed && styles.actBtnPressed,
        disabled && styles.actBtnDisabled,
      ]}
    >
      <View style={styles.actInner}>
        <Icon size={12} color={toneColor} strokeWidth={2.5} />
        <Text style={[styles.actTxt, { color: toneColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  list: { paddingBottom: tokens.space(8) },
  listEmpty: { flexGrow: 1 },
  header: {
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(2),
  },
  headerCount: {
    fontFamily: tokens.font.display.bold,
    fontSize: 22,
    color: tokens.color.ink,
    letterSpacing: -0.4,
  },
  headerBreakdown: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginTop: 2,
  },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12.5,
    color: tokens.color.inkMuted,
    lineHeight: 17,
    marginTop: tokens.space(3),
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
  actInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(1),
  },
  actBtnPressed: { backgroundColor: tokens.color.surfaceAlt },
  actBtnDisabled: { opacity: 0.5 },
  actTxt: { fontFamily: tokens.font.body.semibold, fontSize: 11, color: tokens.color.ink },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 20,
    color: tokens.color.ink,
    marginTop: tokens.space(4),
    marginBottom: tokens.space(2),
  },
  emptySub: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, textAlign: 'center' },
});
