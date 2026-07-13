/**
 * BrandDecor — ambient uses of the brand food family (BrandIcon), kept quiet.
 *
 *   BrandOrnament — a faint, gently-floating row of icons for a screen header.
 *   BrandLoader   — brand loading states in three variants: 'carousel' (one
 *                   slot cross-fading the family), 'dots' (a row bouncing in
 *                   sequence), and 'carousel-dots' (the blend — bouncing slots
 *                   that each cross-fade a trio).
 *   BrandEmptyArt — a still-life icon cluster for empty states.
 *
 * All decorative (hidden from assistive tech) and honor Reduce Motion via the
 * built-in Animated API (native driver), matching the app's other motion.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReduceMotion } from './useReduceMotion';
import { BrandIcon, type BrandFoodName } from './BrandIcon';

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

/* ---------------------------------------------------------------------------
 * BrandLoader
 * ------------------------------------------------------------------------- */

const CAROUSEL_FOODS: BrandFoodName[] = ['bread', 'tomato', 'lemon', 'fish', 'grapes', 'pepper'];
const DOTS_FOODS: BrandFoodName[] = ['bread', 'tomato', 'herb'];
const CARODOTS_SLOTS: BrandFoodName[][] = [
  ['bread', 'grapes', 'lemon'],
  ['tomato', 'fish', 'herb'],
  ['pepper', 'cherry', 'bread'],
];
const CYCLE = 4200; // full cross-fade cycle (ms)

/** One icon that fades in → holds → fades out on a loop, offset by `delay`. */
function FadeIcon({
  food,
  size,
  count,
  delay,
  reduce,
}: {
  food: BrandFoodName;
  size: number;
  count: number;
  delay: number;
  reduce: boolean;
}) {
  // With motion reduced, show only the lead icon statically.
  const op = useRef(new Animated.Value(reduce && delay === 0 ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const slice = CYCLE / count;
    const fade = Math.min(180, slice * 0.35);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: fade, useNativeDriver: true }),
        Animated.delay(Math.max(0, slice - fade * 2)),
        Animated.timing(op, { toValue: 0, duration: fade, useNativeDriver: true }),
        Animated.delay(CYCLE - slice),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [reduce, delay, count, op]);
  const scale = op.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  return (
    <Animated.View style={[styles.fadeAbs, { opacity: op, transform: [{ scale }] }]}>
      <BrandIcon name={food} variant="onLight" size={size} />
    </Animated.View>
  );
}

/** One slot: the given foods cross-fade in sequence within a fixed box. */
function CrossfadeSlot({
  foods,
  size,
  phase = 0,
  reduce,
}: {
  foods: BrandFoodName[];
  size: number;
  phase?: number;
  reduce: boolean;
}) {
  return (
    <View style={{ width: size, height: size }}>
      {foods.map((f, i) => (
        <FadeIcon
          key={`${f}-${i}`}
          food={f}
          size={size}
          count={foods.length}
          delay={((i / foods.length) * CYCLE + phase) % CYCLE}
          reduce={reduce}
        />
      ))}
    </View>
  );
}

/** A child that bounces on a loop, started after `delay` (the dots motion). */
function Bounce({ delay, reduce, children }: { delay: number; reduce: boolean; children: React.ReactNode }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -9, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(300),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [delay, reduce, y]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

export type BrandLoaderVariant = 'carousel' | 'dots' | 'carousel-dots';

export function BrandLoader({
  variant = 'carousel-dots',
  size = 44,
}: {
  variant?: BrandLoaderVariant;
  size?: number;
}) {
  const reduce = useReduceMotion();
  const a11y = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  };

  if (variant === 'carousel') {
    return (
      <View {...a11y}>
        <CrossfadeSlot foods={CAROUSEL_FOODS} size={size} reduce={reduce} />
      </View>
    );
  }

  const dot = Math.round(size * 0.66);
  if (variant === 'dots') {
    return (
      <View style={styles.loaderRow} {...a11y}>
        {DOTS_FOODS.map((f, i) => (
          <Bounce key={f} delay={i * 160} reduce={reduce}>
            <BrandIcon name={f} variant="onLight" size={dot} />
          </Bounce>
        ))}
      </View>
    );
  }

  // 'carousel-dots' — three bouncing slots, each cross-fading a trio.
  return (
    <View style={styles.loaderRow} {...a11y}>
      {CARODOTS_SLOTS.map((trio, i) => (
        <Bounce key={i} delay={i * 160} reduce={reduce}>
          <CrossfadeSlot foods={trio} size={dot} phase={i * 700} reduce={reduce} />
        </Bounce>
      ))}
    </View>
  );
}

/** A small still-life cluster of brand icons — an empty-state illustration. */
export function BrandEmptyArt({
  foods = ['bread', 'tomato', 'herb'],
  size = 88,
}: {
  foods?: BrandFoodName[];
  size?: number;
}) {
  const [a, b, c] = foods;
  return (
    <View
      style={styles.cluster}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {a ? (
        <View style={styles.clusterLeft}>
          <BrandIcon name={a} variant="onLight" size={size * 0.66} />
        </View>
      ) : null}
      {b ? <BrandIcon name={b} variant="onLight" size={size} /> : null}
      {c ? (
        <View style={styles.clusterRight}>
          <BrandIcon name={c} variant="onLight" size={size * 0.6} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'center' },
  loaderRow: { flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'center' },
  fadeAbs: { position: 'absolute', top: 0, left: 0 },
  cluster: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 16 },
  clusterLeft: { marginRight: -10, marginBottom: 6, transform: [{ rotate: '-6deg' }] },
  clusterRight: { marginLeft: -10, marginBottom: 10, transform: [{ rotate: '6deg' }] },
});
