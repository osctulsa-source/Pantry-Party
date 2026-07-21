/**
 * CookedItCelebration — zero-waste success (handoff Micro-Animations Kit).
 * Food glyph pops → fades while a clean-plate glyph pops in; 4 sparkle dots burst.
 * Plays on mount (or when `playKey` changes). Reduce-motion: static plate + note.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BRAND_GROUNDS } from '../theme/brandPalette';
import { BrandIcon, type BrandFoodName } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { MOTION, MOTION_FERN } from './timing';

const SPARKLE_OFFSETS = [
  { dx: -22, dy: -20, color: BRAND_GROUNDS.terracotta },
  { dx: 22, dy: -20, color: MOTION_FERN },
  { dx: -20, dy: 20, color: BRAND_GROUNDS.ochre },
  { dx: 20, dy: 20, color: BRAND_GROUNDS.terracotta },
] as const;

export function CookedItCelebration({
  itemCount,
  fromFood = 'tomato',
  playKey = 0,
}: {
  itemCount: number;
  fromFood?: BrandFoodName;
  /** Remount / bump to replay. */
  playKey?: number;
}) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(reduce ? 1 : 0);
  const sparkle = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      progress.value = 1;
      sparkle.value = 0;
      return;
    }
    progress.value = 0;
    sparkle.value = 0;
    progress.value = withTiming(1, {
      duration: MOTION.cookedMs,
      easing: Easing.out(Easing.cubic),
    });
    sparkle.value = withDelay(
      MOTION.cookedMs * 0.4,
      withTiming(1, { duration: MOTION.cookedMs * 0.3 }),
    );
  }, [reduce, playKey, progress, sparkle]);

  const foodStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = p < 0.55 ? 1 : 0;
    const scale =
      p < 0.35 ? 1 + (p / 0.35) * 0.15 : p < 0.55 ? 1.15 - ((p - 0.35) / 0.2) * 0.45 : 0.7;
    const rotate = p < 0.35 ? -(p / 0.35) * 8 : p < 0.55 ? (10 * (p - 0.35)) / 0.2 : 10;
    return { opacity, transform: [{ scale }, { rotate: `${rotate}deg` }] };
  });

  const plateStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = p < 0.55 ? 0 : p < 0.78 ? (p - 0.55) / 0.23 : 1;
    const scale =
      p < 0.55
        ? 0.5
        : p < 0.78
          ? 0.5 + ((p - 0.55) / 0.23) * 0.58
          : 1.08 - ((p - 0.78) / 0.22) * 0.08;
    return { opacity, transform: [{ scale }] };
  });

  const noteText =
    itemCount > 0
      ? `Nice! ${itemCount} item${itemCount === 1 ? '' : 's'} used up ✓`
      : 'Cooked!';

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.box} pointerEvents="none">
        <Animated.View style={[styles.abs, foodStyle]}>
          <BrandIcon name={fromFood} variant="onLight" size={56} />
        </Animated.View>
        <Animated.View style={[styles.abs, plateStyle]}>
          <BrandIcon name="plate" variant="onLight" size={56} />
        </Animated.View>
        {SPARKLE_OFFSETS.map((o, i) => (
          <Sparkle key={i} progress={sparkle} dx={o.dx} dy={o.dy} color={o.color} reduce={reduce} />
        ))}
      </View>
      <Text style={styles.note}>{noteText}</Text>
    </View>
  );
}

function Sparkle({
  progress,
  dx,
  dy,
  color,
  reduce,
}: {
  progress: SharedValue<number>;
  dx: number;
  dy: number;
  color: string;
  reduce: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (reduce) return { opacity: 0 };
    const p = progress.value;
    return {
      opacity: p < 0.05 || p > 0.85 ? 0 : 1,
      transform: [{ translateX: dx * p }, { translateY: dy * p }, { scale: 0.2 + p * 0.8 }],
    };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: tokens.space(6),
    marginBottom: tokens.space(2),
    gap: tokens.space(2),
  },
  box: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  note: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: tokens.color.success,
  },
});
