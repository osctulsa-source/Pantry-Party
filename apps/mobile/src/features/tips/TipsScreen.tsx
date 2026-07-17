import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bookmark, Lightbulb } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import { Screen } from '../../components/ui';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  KITCHEN_TIPS,
  TIP_CATEGORY_META,
  TIP_CATEGORY_ORDER,
  tipOfTheDay,
  type Tip,
  type TipCategory,
} from '@breadbox/core';
import { useAuth } from '../auth/AuthContext';
import { useSavedTips } from './useSavedTips';
import { TIP_ART, tipTone, tipToneSoft } from './tipArt';

/** 'saved' is a pseudo-category pinned before the real ones. */
type TipFilter = TipCategory | 'saved';

export function TipsScreen() {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  const { savedIds, toggle } = useSavedTips(userId);
  const [selected, setSelected] = useState<TipFilter>('cookware');

  const daily = useMemo(() => tipOfTheDay(new Date().toISOString()), []);

  const tips = useMemo(
    () =>
      selected === 'saved'
        ? KITCHEN_TIPS.filter((t) => savedIds.includes(t.id))
        : KITCHEN_TIPS.filter((t) => t.category === selected),
    [selected, savedIds],
  );

  return (
    <Screen>
      <ScreenHeader title="Kitchen tips" />
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {/* Tip of the day — same pick as the Settings teaser (tipOfTheDay is deterministic). */}
        <View style={styles.daily}>
          <View style={styles.dailyHead}>
            <Lightbulb size={16} color={tokens.color.accent} />
            <Text style={styles.dailyCaption}>Tip of the day</Text>
          </View>
          <Text style={styles.dailyBody}>{daily.body}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          style={styles.categoryScroll}
        >
          {(['saved', ...TIP_CATEGORY_ORDER] as TipFilter[]).map((cat) => {
            const active = cat === selected;
            const label = cat === 'saved' ? 'Saved' : TIP_CATEGORY_META[cat].label;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelected(cat)}
                style={[styles.chip, active && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {selected === 'saved' && tips.length === 0 ? (
          <Text style={styles.savedEmpty}>Nothing saved yet — tap the bookmark on any tip.</Text>
        ) : (
          tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} saved={savedIds.includes(tip.id)} onToggle={() => toggle(tip.id)} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function TipCard({ tip, saved, onToggle }: { tip: Tip; saved: boolean; onToggle: () => void }) {
  const { Icon } = TIP_ART[tip.category];
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: tipToneSoft(tip.category) }]}>
        <Icon size={16} color={tipTone(tip.category)} />
      </View>
      <Text style={styles.cardBody}>{tip.body}</Text>
      <Pressable
        onPress={onToggle}
        hitSlop={12}
        style={styles.bookmark}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? 'Remove from saved' : 'Save tip'}
      >
        <Bookmark
          size={16}
          color={saved ? tokens.color.accent : tokens.color.inkMuted}
          fill={saved ? tokens.color.accent : 'none'}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: tokens.space(6),
    paddingBottom: tokens.space(10),
    gap: tokens.space(2),
  },
  daily: {
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    gap: tokens.space(2),
    marginBottom: tokens.space(2),
  },
  dailyHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  dailyCaption: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.accent,
  },
  dailyBody: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
  },
  categoryScroll: { flexGrow: 0, marginHorizontal: -tokens.space(6), marginBottom: tokens.space(2) },
  categoryRow: {
    flexDirection: 'row',
    gap: tokens.space(2),
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(2),
  },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.ink,
    lineHeight: 18,
  },
  chipTextSelected: { color: tokens.color.onAccent },
  savedEmpty: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    paddingVertical: tokens.space(8),
  },
  card: {
    flexDirection: 'row',
    gap: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cardBody: {
    flex: 1,
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
  },
  bookmark: { marginTop: 1, padding: 2 },
});
