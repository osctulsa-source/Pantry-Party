/**
 * BarcodeScanSuccess — scan line sweep + check badge pop + brief green flash.
 * One-shot when `active` flips true. Reduce-motion: static check, no flash loop.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BRAND_CREAM, BRAND_LEAF } from '../theme/brandPalette';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

export function BarcodeScanSuccess({
  active,
  label = 'Got it!',
}: {
  active: boolean;
  label?: string;
}) {
  const reduce = useReduceMotion();
  const sweep = useSharedValue(0);
  const badge = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      sweep.value = 0;
      badge.value = 0;
      flash.value = 0;
      return;
    }
    if (reduce) {
      badge.value = 1;
      return;
    }
    sweep.value = 0;
    badge.value = 0;
    flash.value = 0;
    sweep.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
    badge.value = withDelay(
      280,
      withSequence(
        withTiming(1.15, { duration: MOTION.chipPopMs, easing: EASE.outBack }),
        withTiming(1, { duration: 160, easing: EASE.outCubic }),
      ),
    );
    flash.value = withDelay(
      200,
      withSequence(
        withTiming(0.35, { duration: 160 }),
        withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
      ),
    );
  }, [active, reduce, sweep, badge, flash]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: reduce ? 0 : interpolate(sweep.value, [0, 0.7, 1], [0.9, 0.9, 0]),
    transform: [{ translateY: interpolate(sweep.value, [0, 1], [-40, 40]) }],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value > 0 ? 1 : 0,
    transform: [{ scale: badge.value || 0.01 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
  }));

  if (!active) return null;

  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      <Animated.View style={[styles.flash, flashStyle]} />
      <View style={styles.stage}>
        <Animated.View style={[styles.line, lineStyle]} />
        <Animated.View style={[styles.badge, badgeStyle]}>
          <Text style={styles.check}>✓</Text>
        </Animated.View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND_LEAF,
  },
  stage: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: BRAND_CREAM,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: BRAND_LEAF,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: BRAND_CREAM,
  },
  check: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 28,
    color: BRAND_CREAM,
  },
  label: {
    marginTop: tokens.space(3),
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: BRAND_CREAM,
  },
});
