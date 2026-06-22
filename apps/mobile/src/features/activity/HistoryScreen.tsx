/**
 * HistoryScreen — the household's activity log (History feature, PR 3).
 *
 * A running, date-grouped record of what happened to your food: recipes cooked,
 * items used in time, items tossed, items restocked. Reads the synced
 * activity_events log (reactive via useActivity), filterable by kind. Opened
 * from Settings. Read-only in v1 (the table supports a deleted tombstone, so
 * "remove an entry" is a natural follow-up).
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChefHat, RotateCcw, Trash2 } from 'lucide-react-native';

import type { ActivityEvent } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { InsightsEmptyArt } from '../../components/illustrations/InsightsEmptyArt';
import { useActivity } from './useActivity';
import { useDisplayName } from '../household/useDisplayName';
import { useAuth } from '../auth/AuthContext';

type Filter = 'all' | 'cooked' | 'used' | 'tossed';

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: 'All', value: 'all' },
  { label: 'Cooked', value: 'cooked' },
  { label: 'Used', value: 'used' },
  { label: 'Tossed', value: 'tossed' },
];

interface KindMeta {
  verb: string;
  color: string;
}

function kindMeta(kind: string): KindMeta {
  switch (kind) {
    case 'cooked':
      return { verb: 'Cooked', color: tokens.color.accent };
    case 'used':
      return { verb: 'Used', color: tokens.color.success };
    case 'tossed':
      return { verb: 'Tossed', color: tokens.semantic.expiry.expired };
    case 'expired':
      return { verb: 'Expired', color: tokens.semantic.expiry.expired };
    case 'restocked':
      return { verb: 'Restocked', color: tokens.color.inkMuted };
    default:
      return { verb: 'Logged', color: tokens.color.inkMuted };
  }
}

// Render the kind's icon directly (avoids assigning a lucide
// ForwardRefExoticComponent into a ComponentType field — not assignable
// under strict TS).
function KindIcon({ kind, color }: { kind: string; color: string }) {
  switch (kind) {
    case 'cooked':
      return <ChefHat size={16} color={color} />;
    case 'tossed':
    case 'expired':
      return <Trash2 size={16} color={color} />;
    case 'restocked':
      return <RotateCcw size={16} color={color} />;
    case 'used':
    default:
      return <Check size={16} color={color} />;
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface DayGroup {
  label: string;
  events: ActivityEvent[];
}

// Events arrive newest-first and contiguous per calendar day, so a single
// pass that opens a new group on each label change preserves order.
function groupByDay(events: ActivityEvent[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const e of events) {
    const label = dayLabel(e.occurredAt, now);
    if (!current || current.label !== label) {
      current = { label, events: [e] };
      groups.push(current);
    } else {
      current.events.push(e);
    }
  }
  return groups;
}

export function HistoryScreen() {
  const { events } = useActivity();
  const { names } = useDisplayName();
  const { state } = useAuth();
  const currentUserId = state.status === 'authenticated' ? state.session.user.id : null;
  const [filter, setFilter] = useState<Filter>('all');
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );
  const groups = useMemo(() => groupByDay(filtered, now), [filtered, now]);

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const selected = f.value === filter;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipTxt, selected && styles.chipTxtOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.center}>
          <InsightsEmptyArt />
          <Text style={styles.emptyTitle}>
            {filter === 'all' ? 'Nothing here yet' : `No ${filter} items yet`}
          </Text>
          <Text style={styles.emptyBody}>
            As you cook, use things up, and clear out what spoiled, it all shows up here — a running
            record for the whole household.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {groups.map((g) => (
            <View key={g.label} style={styles.group}>
              <Text style={styles.dayHead}>{g.label}</Text>
              {g.events.map((e) => {
                const { verb, color } = kindMeta(e.kind);
                // Attribute to a co-member by name; omit for your own actions
                // (implicitly you) and when no name is known (avoids id noise).
                const actor =
                  e.addedBy && e.addedBy !== currentUserId ? names.get(e.addedBy) : undefined;
                return (
                  <View key={e.id} style={styles.row}>
                    <View style={styles.iconWrap}>
                      <KindIcon kind={e.kind} color={color} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel} numberOfLines={1}>
                        <Text style={[styles.verb, { color }]}>{verb} </Text>
                        {e.label}
                      </Text>
                      <Text style={styles.rowTime}>
                        {timeLabel(e.occurredAt)}
                        {actor ? ` · ${actor}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  chips: {
    flexDirection: 'row',
    gap: tokens.space(2),
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(2),
  },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipOn: { backgroundColor: tokens.color.accent },
  chipTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  chipTxtOn: { color: tokens.color.onAccent },
  scroll: { paddingHorizontal: tokens.space(6), paddingBottom: tokens.space(10) },
  group: { marginTop: tokens.space(4) },
  dayHead: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { flex: 1, fontFamily: tokens.font.body.regular, fontSize: 15, color: tokens.color.ink },
  verb: { fontFamily: tokens.font.body.semibold },
  rowTime: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
    marginLeft: tokens.space(2),
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
