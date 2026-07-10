/**
 * AnnouncementCard — in-app active-announcement card with reaction chips.
 * Renders on Shopping (shopping_run) and Cook (cooking) screens. The sender
 * sees reaction counts; everyone else can tap a reaction chip.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Reaction } from '@breadbox/core';
import { formatDepartureLabel, REACTIONS } from '@breadbox/core';

import { tokens } from '../../theme/tokens';
import type { ActiveAnnouncement } from './useActiveAnnouncements';
import { reactToAnnouncement } from './reactToAnnouncement';

const REACTION_LABELS: Record<Reaction, { emoji: string; label: string }> = {
  thumbs_up: { emoji: '👍', label: 'Nice' },
  party: { emoji: '🎉', label: 'Celebrate' },
  cant_tonight: { emoji: '🙅', label: "Can't tonight" },
};

function reactionCounts(
  reactions: ActiveAnnouncement['reactions'],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
  }
  return counts;
}

export function AnnouncementCard({
  announcement,
  isMine,
  onPress,
}: {
  announcement: ActiveAnnouncement;
  isMine: boolean;
  onPress?: () => void;
}) {
  const isRun = announcement.kind === 'shopping_run';
  const counts = reactionCounts(announcement.reactions);

  const meta = () => {
    if (isRun && announcement.departs_at) {
      return `Heads out around ${formatDepartureLabel(announcement.departs_at)}${announcement.store_hint ? ` · ${announcement.store_hint}` : ''}`;
    }
    if (!isRun && announcement.recipe_title) {
      return `Making ${announcement.recipe_title}`;
    }
    return null;
  };

  function onReact(reaction: Reaction) {
    Haptics.selectionAsync().catch(() => {});
    void reactToAnnouncement({
      announcementId: announcement.id,
      householdId: announcement.household_id,
      userId: announcement.created_by, // placeholder — overridden in the reaction writer
      reaction,
    });
  }

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        isRun
          ? `Shopping run${announcement.store_hint ? ` to ${announcement.store_hint}` : ''}`
          : `Cooking ${announcement.recipe_title ?? ''}`
      }
    >
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {isRun
            ? `${announcement.created_by} is heading to the store`
            : `${announcement.created_by} is cooking tonight`}
        </Text>
        {meta() && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta()}
          </Text>
        )}
      </View>

      {!isMine && (
        <View style={styles.reactionRow}>
          {REACTIONS.map((r) => {
            const { emoji } = REACTION_LABELS[r];
            return (
              <Pressable
                key={r}
                style={styles.chip}
                onPress={() => onReact(r)}
                accessibilityRole="button"
                accessibilityLabel={REACTION_LABELS[r].label}
              >
                <Text style={styles.chipEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {isMine && Object.keys(counts).length > 0 && (
        <View style={styles.reactionRow}>
          {Object.entries(counts).map(([key, count]) => {
            const info = REACTION_LABELS[key as Reaction];
            if (!info) return null;
            return (
              <View key={key} style={styles.chip}>
                <Text style={styles.chipEmoji}>{info.emoji}</Text>
                <Text style={styles.chipCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    marginBottom: tokens.space(2),
  },
  head: {
    gap: 2,
    marginBottom: tokens.space(2),
  },
  title: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 14,
    color: tokens.color.ink,
  },
  meta: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: tokens.space(2),
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    borderWidth: 0,
  },
  chipEmoji: { fontSize: 15 },
  chipCount: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    color: tokens.color.inkMuted,
  },
});
