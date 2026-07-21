/**
 * FirstRunReveal — 3 glyphs stagger-pop into a row, then wordmark fades up.
 * Leads into the welcome screen (caller advances on `onDone`).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BrandIcon, type BrandFoodName } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

const DEFAULT_FOODS: BrandFoodName[] = ['bread', 'tomato', 'herb'];

function PopGlyph({
  name,
  index,
  reduce,
}: {
  name: BrandFoodName;
  index: number;
  reduce: boolean;
}) {
  const op = useSharedValue(reduce ? 1 : 0);
  const scale = useSharedValue(reduce ? 1 : 0.6);

  useEffect(() => {
    if (reduce) return;
    const delay = index * MOTION.staggerMs;
    op.value = withDelay(delay, withTiming(1, { duration: MOTION.heroPopMs * 0.7, easing: EASE.outCubic }));
    scale.value = withDelay(
      delay,
      withTiming(1, { duration: MOTION.heroPopMs * 0.7, easing: EASE.outBack }),
    );
  }, [reduce, index, op, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <BrandIcon name={name} variant="onColor" size={56} />
    </Animated.View>
  );
}

export function FirstRunReveal({
  onDone,
  foods = DEFAULT_FOODS,
}: {
  onDone: () => void;
  foods?: BrandFoodName[];
}) {
  const reduce = useReduceMotion();
  const copyOp = useSharedValue(reduce ? 1 : 0);
  const copyY = useSharedValue(reduce ? 0 : 12);

  useEffect(() => {
    if (reduce) {
      const t = setTimeout(onDone, 240);
      return () => clearTimeout(t);
    }
    const copyDelay = foods.length * MOTION.staggerMs + MOTION.heroPopMs * 0.55;
    copyOp.value = withDelay(copyDelay, withTiming(1, { duration: MOTION.fadeUpMs, easing: EASE.outCubic }));
    copyY.value = withDelay(copyDelay, withTiming(0, { duration: MOTION.fadeUpMs, easing: EASE.outCubic }));
    const t = setTimeout(onDone, copyDelay + MOTION.fadeUpMs + 600);
    return () => clearTimeout(t);
  }, [reduce, onDone, foods.length, copyOp, copyY]);

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyOp.value,
    transform: [{ translateY: copyY.value }],
  }));

  return (
    <View style={styles.root} accessibilityLabel={`Welcome to ${tokens.brandName}`}>
      <View style={styles.row}>
        {foods.map((f, i) => (
          <PopGlyph key={f} name={f} index={i} reduce={reduce} />
        ))}
      </View>
      <Animated.View style={[styles.copy, copyStyle]}>
        <Text style={styles.title}>{tokens.brandName}</Text>
        <Text style={styles.subtitle}>Your kitchen, sorted</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.secondary,
    gap: tokens.space(6),
    paddingHorizontal: tokens.space(8),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(4),
  },
  copy: { alignItems: 'center' },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 30,
    color: tokens.color.onAccent,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.onAccent,
    opacity: 0.85,
  },
});
