/**
 * SimmeringLoader — recipe-query wait (handoff): flame + 3 orbiting dots
 * (2.6s/rev linear; each pulses 1.3s, stagger 430ms). Reduce-motion: static flame.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BRAND_GROUNDS } from '../theme/brandPalette';
import { BrandIcon } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { MOTION, MOTION_FERN } from './timing';

const DOTS = [
  { style: { top: 0, left: '50%' as const, marginLeft: -4 }, color: BRAND_GROUNDS.terracotta, delay: 0 },
  { style: { bottom: 6, left: 6 }, color: MOTION_FERN, delay: MOTION.simmerPulseStaggerMs },
  { style: { bottom: 6, right: 6 }, color: BRAND_GROUNDS.ochre, delay: MOTION.simmerPulseStaggerMs * 2 },
] as const;

function Dot({
  style,
  color,
  delay,
  reduce,
}: {
  style: object;
  color: string;
  delay: number;
  reduce: boolean;
}) {
  const pulse = useSharedValue(reduce ? 1 : 0.55);
  useEffect(() => {
    if (reduce) {
      pulse.value = 1;
      return;
    }
    pulse.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: MOTION.simmerPulseMs / 2, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [reduce, delay, pulse]);

  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style, animStyle]} />;
}

export function SimmeringLoader({
  label = 'Simmering recipes…',
  size = 76,
  style,
}: {
  label?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(
      withTiming(1, { duration: MOTION.simmerOrbitMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(spin);
  }, [reduce, spin]);

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View style={[styles.stage, { width: size, height: size }]}>
        <View style={styles.center}>
          <BrandIcon name="flame" variant="onLight" size={Math.round(size * 0.53)} />
        </View>
        {!reduce ? (
          <Animated.View style={[StyleSheet.absoluteFill, orbitStyle]}>
            {DOTS.map((d, i) => (
              <Dot key={i} style={d.style} color={d.color} delay={d.delay} reduce={false} />
            ))}
          </Animated.View>
        ) : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', zIndex: 1 },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  label: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: BRAND_GROUNDS.cocoa,
    textAlign: 'center',
  },
});
