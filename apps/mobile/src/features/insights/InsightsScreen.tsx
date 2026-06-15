/**
 * InsightsScreen — "Your impact": streak, savings, and activity history.
 *
 * Pushed from SettingsScreen (root-stack route, full-screen over the tab bar).
 * Hero card: the streak with a flame, animated count-up on mount. Below: a
 * stats grid (rescues, tossed, cooks, estimated savings) and a recent-activity
 * feed merging the last ~10 events from both logs by date, newest first.
 *
 * All data is on-device (AsyncStorage event logs) via the useInsights hook;
 * no network, no backend, no sync. Crumb-styled, dark mode safe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../theme/tokens';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useInsights } from './useInsights';
import { readExpiryEvents, type ExpiryEvent } from '../pantry/expiryEvents';
import { readCookEvents, type CookEvent } from '../recipes/cookLog';

interface ActivityRow {
  id: string;
  kind: 'used' | 'tossed' | 'cook';
  label: string;
  at: string; // ISO
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function iconFor(kind: ActivityRow['kind']): string {
  switch (kind) {
    case 'used': return '✓';
    case 'tossed': return '✕';
    case 'cook': return '🍳';
  }
}

function colorFor(kind: ActivityRow['kind']): string {
  switch (kind) {
    case 'used': return tokens.color.success;
    case 'tossed': return tokens.semantic.expiry.expired;
    case 'cook': return tokens.color.accent;
  }
}

/** Animated counter that rolls from 0 to `target` on mount. */
function CountUp({ target }: { target: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: target,
      duration: Math.min(800, target * 80),
      useNativeDriver: false, // we need JS-side listener for the display
    }).start();
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    return () => anim.removeListener(id);
  }, [target, anim]);

  return <Text style={styles.heroNumber}>{display}</Text>;
}

export function InsightsScreen() {
  const { activeHouseholdId } = useActiveHousehold();
  const { insights, loading } = useInsights(activeHouseholdId);

  const [activity, setActivity] = useState<ActivityRow[]>([]);
  useEffect(() => {
    if (!activeHouseholdId) return;
    let cancelled = false;
    (async () => {
      const [expiry, cooks] = await Promise.all([
        readExpiryEvents(activeHouseholdId),
        readCookEvents(activeHouseholdId),
      ]);
      if (cancelled) return;
      const rows: ActivityRow[] = [];
      for (const e of expiry) {
        rows.push({
          id: `e-${e.at}-${e.itemName}`,
          kind: e.kind,
          label: e.kind === 'used' ? `Rescued ${e.itemName}` : `Tossed ${e.itemName}`,
          at: e.at,
        });
      }
      for (const c of cooks) {
        rows.push({
          id: `c-${c.cookedAt}-${c.recipeId}`,
          kind: 'cook',
          label: `Cooked ${c.recipeTitle}`,
          at: c.cookedAt,
        });
      }
      rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setActivity(rows.slice(0, 15));
    })();
    return () => { cancelled = true; };
  }, [activeHouseholdId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={activity}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <>
            {/* Hero streak card */}
            <View style={styles.heroCard}>
              <Text style={styles.heroFlame}>🔥</Text>
              <CountUp target={insights.streakDays} />
              <Text style={styles.heroLabel}>
                {insights.streakDays === 1 ? 'day without food waste' : 'days without food waste'}
              </Text>
              {insights.bestStreak > insights.streakDays && (
                <Text style={styles.heroBest}>Personal best: {insights.bestStreak} days</Text>
              )}
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <StatTile label="Rescued" value={String(insights.totalRescues)} color={tokens.color.success} />
              <StatTile label="Tossed" value={String(insights.totalTossed)} color={tokens.semantic.expiry.expired} />
              <StatTile label="Cooked" value={String(insights.totalCooks)} color={tokens.color.accent} />
              <StatTile label="Est. saved" value={`$${insights.estimatedSavings}`} color={tokens.color.accent} />
            </View>

            {/* Savings context */}
            <Text style={styles.savingsNote}>
              Based on the EPA estimate of ~$2.50 per rescued item (US household of four average).
            </Text>

            {/* Activity header */}
            {activity.length > 0 && <Text style={styles.activityTitle}>Recent activity</Text>}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySub}>
              Start using items from your pantry — every rescue and cook shows up here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.actRow}>
            <Text style={[styles.actIcon, { color: colorFor(item.kind) }]}>{iconFor(item.kind)}</Text>
            <View style={styles.actMain}>
              <Text style={styles.actLabel} numberOfLines={1}>{item.label}</Text>
              <Text style={styles.actDate}>{formatDate(item.at)}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(4), paddingBottom: tokens.space(10) },

  // Hero
  heroCard: {
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.lg,
    padding: tokens.space(6),
    alignItems: 'center',
    marginBottom: tokens.space(5),
  },
  heroFlame: { fontSize: 36, marginBottom: tokens.space(2) },
  heroNumber: {
    fontFamily: tokens.font.display.bold,
    fontSize: 64,
    color: tokens.color.onAccent,
    letterSpacing: -2,
    lineHeight: 68,
  },
  heroLabel: {
    fontFamily: tokens.font.body.medium,
    fontSize: 15,
    color: tokens.color.onAccent,
    opacity: 0.85,
    marginTop: tokens.space(1),
  },
  heroBest: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    color: tokens.color.onAccent,
    opacity: 0.65,
    marginTop: tokens.space(2),
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space(3),
    marginBottom: tokens.space(3),
  },
  tile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    alignItems: 'center',
  },
  tileValue: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    letterSpacing: -1,
    lineHeight: 32,
  },
  tileLabel: {
    fontFamily: tokens.font.body.medium,
    fontSize: 12,
    color: tokens.color.inkMuted,
    marginTop: tokens.space(1),
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  savingsNote: {
    fontFamily: tokens.font.body.regular,
    fontSize: 11,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    marginBottom: tokens.space(6),
    lineHeight: 15,
  },

  // Activity feed
  activityTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  actRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  actIcon: { fontFamily: tokens.font.body.semibold, fontSize: 16, width: 22, textAlign: 'center' },
  actMain: { flex: 1 },
  actLabel: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.ink },
  actDate: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: 1 },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
  },
  emptySub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
