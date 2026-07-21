/**
 * ReceiptScanLoader — OCR wait (handoff): receipt drifts, fern scan line sweeps,
 * 3 data-block chips pop (staggered). Reduce-motion: static receipt only.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BRAND_GROUNDS } from '../theme/brandPalette';
import { BrandIcon } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { MOTION, MOTION_FERN } from './timing';

const CHIPS = [
  { top: '30%', width: 20, color: MOTION_FERN, delay: 200 },
  { top: '50%', width: 26, color: BRAND_GROUNDS.terracotta, delay: 600 },
  { top: '70%', width: 16, color: BRAND_GROUNDS.ochre, delay: 1000 },
] as const;

function Chip({
  top,
  width,
  color,
  delay,
  scan,
}: {
  top: `${number}%`;
  width: number;
  color: string;
  delay: number;
  scan: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = ((scan.value * MOTION.receiptScanMs - delay + MOTION.receiptScanMs) % MOTION.receiptScanMs) /
      MOTION.receiptScanMs;
    const visible = t > 0.15 && t < 0.7;
    return { opacity: visible ? 1 : 0, transform: [{ translateX: visible ? 0 : -6 }] };
  });
  return <Animated.View style={[styles.chip, { top, width, backgroundColor: color }, style]} />;
}

export function ReceiptScanLoader({
  label,
  style,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const drift = useSharedValue(0);
  const scan = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      drift.value = 0;
      scan.value = 0;
      return;
    }
    drift.value = withRepeat(
      withTiming(1, { duration: MOTION.receiptDriftMs, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    scan.value = withRepeat(
      withTiming(1, { duration: MOTION.receiptScanMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(drift);
      cancelAnimation(scan);
    };
  }, [reduce, drift, scan]);

  const receiptStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduce ? 0 : (drift.value - 0.5) * 16 }],
  }));
  const scanStyle = useAnimatedStyle(() => ({
    top: `${6 + scan.value * 86}%`,
    opacity: scan.value < 0.1 || scan.value > 0.9 ? 0 : 1,
  }));

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Reading your receipt'}
    >
      <View style={styles.stage}>
        <Animated.View style={receiptStyle}>
          <BrandIcon name="receipt" variant="onLight" size={48} />
        </Animated.View>
        {!reduce ? <Animated.View style={[styles.scanLine, scanStyle]} /> : null}
        {!reduce
          ? CHIPS.map((c, i) => (
              <Chip key={i} top={c.top} width={c.width} color={c.color} delay={c.delay} scan={scan} />
            ))
          : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: tokens.space(3) },
  stage: {
    width: 90,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    height: 2,
    backgroundColor: MOTION_FERN,
  },
  chip: { position: 'absolute', right: 4, height: 6, borderRadius: 3 },
  label: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: BRAND_GROUNDS.cocoa,
    textAlign: 'center',
  },
});
