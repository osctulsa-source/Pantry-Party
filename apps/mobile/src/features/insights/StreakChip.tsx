/**
 * StreakChip — compact flame + day-count on the Pantry home tab.
 *
 * Only renders when the streak is ≥1 (a new user with no events sees nothing,
 * not a "0 days" chip). Tapping navigates to the full Insights screen.
 * Sits below the action row; the parent passes the navigation callback.
 *
 * Milestone delight: when the streak lands on 7, 14, or 30 days the chip
 * celebrates once — a single spring bounce while a soft accent halo blooms
 * out behind it and fades. Every other day it sits still and quiet, exactly
 * as before. Native-driver only (transform + opacity), so the pulse runs off
 * the JS thread at 60fps. The hooks run unconditionally (above the days<1
 * early return) to stay within the Rules of Hooks across the render→null
 * transition.
 */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../theme/tokens';

// Streak lengths worth a little fanfare. Easy to extend (e.g. 60, 90, 365).
const MILESTONES = [7, 14, 30];

export function StreakChip({
  days,
  onPress,
}: {
  days: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const isMilestone = MILESTONES.includes(days);

  useEffect(() => {
    if (!isMilestone) return;
    // One-shot celebration: settle for a beat, then a single bounce while a
    // halo blooms outward and fades behind the chip.
    scale.setValue(1);
    glow.setValue(0);
    Animated.sequence([
      Animated.delay(250),
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, {
            toValue: 1.15,
            tension: 120,
            friction: 5,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            tension: 120,
            friction: 6,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [isMilestone, days, scale, glow]);

  if (days < 1) return null;

  // Derive the halo's look from the single glow driver: it fades in to a
  // restrained 0.5 (so it reads as a glow, not a second chip) and scales out
  // past the chip edges so it appears to radiate.
  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });
  const glowScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.3],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.pulse, { transform: [{ scale }] }]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
        />
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.space(6),
    marginBottom: tokens.space(3),
  },
  pulse: {
    alignSelf: 'flex-start',
  },
  glow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 999,
    backgroundColor: tokens.color.accent,
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
