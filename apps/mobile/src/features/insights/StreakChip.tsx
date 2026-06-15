/**
 * StreakChip — compact flame + day-count on the Pantry home tab.
 *
 * Only renders when the streak is ≥1 (a new user with no events sees nothing,
 * not a "0 days" chip). Tapping navigates to the full Insights screen.
 * Sits below the action row; the parent passes the navigation callback.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../theme/tokens';

export function StreakChip({
  days,
  onPress,
}: {
  days: number;
  onPress: () => void;
}) {
  if (days < 1) return null;
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${days} day streak — tap for details`}
      >
        <Text style={styles.flame}>🔥</Text>
        <Text style={styles.text}>
          {days} {days === 1 ? 'day' : 'days'} · no food wasted
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.space(6),
    marginBottom: tokens.space(3),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.accentSoft,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  chipPressed: { opacity: 0.8 },
  flame: { fontSize: 14 },
  text: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: tokens.color.accent,
  },
});
