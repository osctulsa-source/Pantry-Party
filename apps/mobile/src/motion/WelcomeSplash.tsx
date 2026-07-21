/**
 * WelcomeSplash — hero glyph pop-in (~700ms) then wordmark/tagline fade-up.
 * Replayable on each app open (caller resets via remount / key).
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BrandIcon } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

export function WelcomeSplash({
  onDone,
  hero = 'bread',
}: {
  onDone: () => void;
  hero?: 'bread' | 'tomato' | 'herb';
}) {
  const reduce = useReduceMotion();
  const glyphOp = useSharedValue(reduce ? 1 : 0);
  const glyphScale = useSharedValue(reduce ? 1 : 0.72);
  const copyOp = useSharedValue(reduce ? 1 : 0);
  const copyY = useSharedValue(reduce ? 0 : 14);
  const rootOp = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      const t = setTimeout(onDone, 280);
      return () => clearTimeout(t);
    }

    glyphOp.value = withTiming(1, { duration: MOTION.heroPopMs, easing: EASE.outCubic });
    glyphScale.value = withTiming(1, { duration: MOTION.heroPopMs, easing: EASE.outBack });
    copyOp.value = withDelay(
      MOTION.heroPopMs - 80,
      withTiming(1, { duration: MOTION.fadeUpMs, easing: EASE.outCubic }),
    );
    copyY.value = withDelay(
      MOTION.heroPopMs - 80,
      withTiming(0, { duration: MOTION.fadeUpMs, easing: EASE.outCubic }),
    );

    const hold = MOTION.heroPopMs + MOTION.fadeUpMs + 720;
    const t = setTimeout(() => {
      rootOp.value = withTiming(0, { duration: 380, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          // onDone is JS — schedule outside worklet
        }
      });
      setTimeout(onDone, 400);
    }, hold);
    return () => clearTimeout(t);
  }, [reduce, onDone, glyphOp, glyphScale, copyOp, copyY, rootOp]);

  const glyphStyle = useAnimatedStyle(() => ({
    opacity: glyphOp.value,
    transform: [{ scale: glyphScale.value }],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copyOp.value,
    transform: [{ translateY: copyY.value }],
  }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOp.value }));

  return (
    <Animated.View
      style={[styles.root, rootStyle]}
      accessibilityLabel={`Welcome to ${tokens.brandName}`}
    >
      <View style={styles.lockup}>
        <Animated.View style={glyphStyle}>
          <BrandIcon name={hero} variant="onColor" size={96} tone="terracotta" />
        </Animated.View>
        <Animated.View style={[styles.copy, copyStyle]}>
          <Text style={styles.title}>{tokens.brandName}</Text>
          <Text style={styles.subtitle}>Welcome to the kitchen</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.secondary,
  },
  lockup: { alignItems: 'center', paddingHorizontal: tokens.space(8) },
  copy: { alignItems: 'center' },
  title: {
    marginTop: tokens.space(5),
    fontFamily: tokens.font.display.bold,
    fontSize: 32,
    letterSpacing: -0.5,
    color: tokens.color.onAccent,
  },
  subtitle: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.onAccent,
    opacity: 0.85,
  },
});
