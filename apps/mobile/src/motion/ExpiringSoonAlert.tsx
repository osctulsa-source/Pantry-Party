/**
 * ExpiringSoonAlert — pulsing amber/red ring + subtle shake + count badge.
 * Reduce-motion: static ring + badge (no pulse/shake).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

export function ExpiringSoonAlert({
  count,
  urgency = 'warning',
  style,
}: {
  count: number;
  urgency?: 'warning' | 'expired';
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const pulse = useSharedValue(1);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (reduce || count < 1) {
      pulse.value = 1;
      shake.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: MOTION.breathMs / 2, easing: EASE.inOutSine }),
        withTiming(1, { duration: MOTION.breathMs / 2, easing: EASE.inOutSine }),
      ),
      -1,
      false,
    );
    shake.value = withRepeat(
      withSequence(
        withTiming(-1.5, { duration: 70 }),
        withTiming(1.5, { duration: 70 }),
        withTiming(0, { duration: 70 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(shake);
    };
  }, [reduce, count, pulse, shake]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }, { translateX: shake.value }],
  }));

  if (count < 1) return null;

  const color =
    urgency === 'expired' ? tokens.semantic.expiry.expired : tokens.semantic.expiry.warning;
  const soft =
    urgency === 'expired'
      ? tokens.semantic.expiry.expiredSoft
      : tokens.semantic.expiry.warningSoft;

  return (
    <View
      style={[styles.wrap, { backgroundColor: soft }, style]}
      accessibilityLabel={`${count} items ${urgency === 'expired' ? 'expired' : 'expiring soon'}`}
    >
      <Animated.View style={[styles.ring, { borderColor: color }, ringStyle]}>
        <Text style={[styles.count, { color }]}>{count}</Text>
      </Animated.View>
      <Text style={[styles.label, { color }]}>
        {urgency === 'expired' ? 'Past date' : 'Expiring soon'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: tokens.radius.md,
    alignSelf: 'flex-start',
  },
  ring: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  count: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
  },
});
