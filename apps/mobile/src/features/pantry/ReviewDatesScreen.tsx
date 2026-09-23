/**
 * ReviewDatesScreen — one-time repair for auto-filled expiry dates.
 *
 * Until July 2026 the capture flows stored every scanned item as "pantry" and
 * estimated its expiry with a location-less lookup (milk got the 91-day
 * freezer number). The add flows are fixed; this screen repairs the rows that
 * are already in the pantry. Core's suggestDateRepairs re-runs today's
 * inference (anchored at each item's addedAt) and proposes location + date
 * corrections; the user unchecks anything they set deliberately, then applies
 * the rest in one transaction.
 *
 * Reached from Settings → "Review expiry dates". The row shows a badge when
 * proposals exist, and this screen shows a calm all-clear when they don't.
 */
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Check } from 'lucide-react-native';

import { suggestDateRepairs, type RepairProposal } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import { setPantryExpiryAndLocation } from './pantryWrites';
import { usePantryItems } from './usePantryItems';
import { CategoryIcon } from './CategoryIcon';
import { categorizeByName } from '@breadbox/core';

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "pantry → fridge" only when the location actually changes. */
function locationLine(p: RepairProposal): string | null {
  return p.suggestedLocation === p.currentLocation
    ? null
    : `${p.currentLocation} → ${p.suggestedLocation}`;
}

export function ReviewDatesScreen() {
  const navigation = useNavigation();
  const { items } = usePantryItems();
  const [applying, setApplying] = useState(false);
  // Ids the user EXCLUDED (default = everything selected). Tracking exclusions
  // keeps newly-arriving proposals selected without effect juggling.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const proposals = useMemo(
    () =>
      suggestDateRepairs(
        items.map((i) => ({
          id: i.id,
          name: i.name,
          location: i.location,
          addedAt: i.addedAt,
          expiresAt: i.expiresAt,
        })),
      ),
    [items],
  );
  const selectedCount = proposals.length - excluded.size;

  function toggle(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applySelected() {
    const chosen = proposals.filter((p) => !excluded.has(p.itemId));
    if (chosen.length === 0 || applying) return;
    setApplying(true);
    try {
      const db = getPowerSync();
      const now = Date.now();
      await db.writeTransaction(async (tx) => {
        for (const p of chosen) {
          await setPantryExpiryAndLocation(p.itemId, p.suggestedExpiresAt, p.suggestedLocation, tx, now);
        }
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // The reactive query drains the applied proposals out of the list; when
      // everything was fixed, pop back to Settings with the good news.
      if (chosen.length === proposals.length) navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setApplying(false);
    }
  }

  if (proposals.length === 0) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyBadge}>
            <Check size={22} color={tokens.color.success} />
          </View>
          <Text style={styles.emptyTitle}>Dates look good</Text>
          <Text style={styles.emptySub}>
            Every item&apos;s expiry matches what we&apos;d estimate today. New scans get
            location-aware dates automatically.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <Text style={styles.intro}>
        Early scans guessed some dates wrong. Here&apos;s what today&apos;s smarter estimate
        suggests — uncheck anything you set yourself.
      </Text>
      <FlatList
        data={proposals}
        keyExtractor={(p) => p.itemId}
        contentContainerStyle={styles.list}
        renderItem={({ item: p }) => {
          const selected = !excluded.has(p.itemId);
          const loc = locationLine(p);
          return (
            <Pressable
              style={styles.row}
              onPress={() => toggle(p.itemId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${p.name}: ${shortDate(p.currentExpiresAt)} to ${shortDate(p.suggestedExpiresAt)}${loc ? `, ${loc}` : ''}`}
            >
              <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                {selected && <Check size={12} color={tokens.color.onAccent} />}
              </View>
              <View style={styles.iconCircle}>
                <CategoryIcon category={categorizeByName(p.name)} size={16} color={tokens.color.accent} />
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <View style={styles.changeRow}>
                  <Text style={styles.oldValue}>{shortDate(p.currentExpiresAt)}</Text>
                  <ArrowRight size={12} color={tokens.color.inkMuted} />
                  <Text style={styles.newValue}>{shortDate(p.suggestedExpiresAt)}</Text>
                  {loc && <Text style={styles.locChange}>· {loc}</Text>}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <View style={styles.footer}>
        <Pressable
          style={[styles.applyBtn, (selectedCount === 0 || applying) && styles.applyBtnDisabled]}
          onPress={() => void applySelected()}
          disabled={selectedCount === 0 || applying}
          accessibilityRole="button"
          accessibilityLabel={`Fix ${selectedCount} dates`}
        >
          <Text style={styles.applyTxt}>
            {applying ? 'Fixing…' : `Fix ${selectedCount} ${selectedCount === 1 ? 'date' : 'dates'}`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  intro: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.color.inkMuted,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(2),
  },
  list: { paddingHorizontal: tokens.space(6), paddingBottom: tokens.space(4) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.sm,
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.accentSoft,
  },
  rowMain: { flex: 1 },
  name: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1), marginTop: 2 },
  oldValue: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12.5,
    color: tokens.color.inkMuted,
    textDecorationLine: 'line-through',
  },
  newValue: { fontFamily: tokens.font.body.semibold, fontSize: 12.5, color: tokens.color.accent },
  locChange: { fontFamily: tokens.font.body.regular, fontSize: 12.5, color: tokens.color.inkMuted },
  footer: { paddingHorizontal: tokens.space(6), paddingVertical: tokens.space(3) },
  applyBtn: {
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyBadge: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.accentSoft,
    marginBottom: tokens.space(3),
  },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 20,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
  },
  emptySub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.color.inkMuted,
    textAlign: 'center',
  },
});
