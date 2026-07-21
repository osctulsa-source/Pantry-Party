/**
 * ProgressRingBadge — the achievement progress ring from the App Elements
 * design kit (1j). A REAL animated ring: the handoff shipped a static
 * placeholder and noted "swap to an SVG strokeDashoffset ring for real
 * animation" — done here with react-native-svg + Reanimated, using the same
 * useAnimatedProps pattern as motion/SproutRefresh. The arc animates toward its
 * new value on change and snaps (no animation) under OS reduce-motion.
 *
 * Kept in its own module (apart from the static BadgeGrid) so the rest of the
 * kit — and its tests — don't pull in reanimated, which the mobile jest harness
 * doesn't initialize.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { tokens } from '../../theme/tokens';
import { BrandIcon, type BrandFoodName } from '../BrandIcon';
import { useReduceMotion } from '../useReduceMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** progress: 0–1 fraction toward the next milestone. */
export function ProgressRingBadge({
  progress,
  food = 'flame',
  size = 76,
  label,
}: {
  progress: number;
  food?: BrandFoodName;
  size?: number;
  label?: string;
}) {
  const reduce = useReduceMotion();
  const target = Math.max(0, Math.min(1, progress));
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;

  const p = useSharedValue(target);
  useEffect(() => {
    // Animate the arc toward the new value; reduce-motion snaps straight to it.
    p.value = reduce ? target : withTiming(target, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [target, reduce, p]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));

  const inner = size - stroke * 2 - 8;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progress to next milestone'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={cx} cy={cx} r={r} stroke={tokens.color.surfaceAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={cx}
          cy={cx}
          r={r}
          stroke={tokens.color.secondary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          animatedProps={arcProps}
          // Start the arc at 12 o'clock instead of 3 o'clock.
          transform={`rotate(-90, ${cx}, ${cx})`}
        />
      </Svg>
      <View
        style={[styles.ringInner, { width: inner, height: inner, borderRadius: inner / 2 }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <BrandIcon name={food} variant="onLight" size={Math.round(inner * 0.4)} />
        <Text style={styles.ringPct}>{Math.round(target * 100)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringInner: {
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  ringPct: { fontFamily: tokens.font.body.semibold, fontSize: 11, color: tokens.color.inkMuted },
});
