/**
 * BrandDecor — ambient uses of the brand food family (BrandIcon), kept quiet.
 *
 *   BrandOrnament — a faint, gently-floating row of icons for a screen header.
 *   BrandLoader   — a single icon that breathes, for loading states.
 *
 * Both are decorative (hidden from assistive tech) and honor Reduce Motion via
 * the built-in Animated API (native driver), matching the app's other motion.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReduceMotion } from './useReduceMotion';
import { BrandIcon, type BrandFoodName } from './BrandIcon';
import type { BrandTone } from '../theme/brandPalette';

/** A child that gently bobs on a loop (or sits still when motion is reduced). */
function Float({ enabled, delay = 0, children }: { enabled: boolean; delay?: number; children: React.ReactNode }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      y.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -4, duration: 1600, delay, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, delay, y]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

const DEFAULT_ORNAMENT: BrandFoodName[] = ['tomato', 'herb', 'lemon', 'grapes', 'pear', 'cherry', 'carrot'];

export function BrandOrnament({
  foods = DEFAULT_ORNAMENT,
  size = 30,
  opacity = 0.55,
}: {
  foods?: BrandFoodName[];
  size?: number;
  opacity?: number;
}) {
  const reduce = useReduceMotion();
  return (
    <View
      style={[styles.row, { opacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {foods.map((f, i) => (
        <Float key={f} enabled={!reduce} delay={i * 200}>
          <BrandIcon name={f} variant="onLight" size={size} />
        </Float>
      ))}
    </View>
  );
}

export function BrandLoader({
  tone,
  name = 'bread',
  size = 56,
}: {
  tone?: BrandTone;
  name?: BrandFoodName;
  size?: number;
}) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 1600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, scale]);
  return (
    <Animated.View
      style={{ transform: [{ scale }] }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BrandIcon name={name} tone={tone} variant="onLight" size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'center' },
});
