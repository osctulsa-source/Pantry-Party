/**
 * SproutRefresh — pull-to-refresh glyph: stem grows, left leaf, then right leaf.
 * Reuses herb leaf construction. Reduce-motion: static full sprout while refreshing.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { BRAND_LEAF } from '../theme/brandPalette';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

export function SproutRefresh({
  refreshing,
  size = 36,
}: {
  refreshing: boolean;
  size?: number;
}) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(reduce && refreshing ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    if (!refreshing) {
      progress.value = withTiming(0, { duration: 200, easing: EASE.inCubic });
      return;
    }
    if (reduce) {
      progress.value = 1;
      return;
    }
    const cycle = withSequence(
      withTiming(0.4, { duration: MOTION.sproutGrowMs * 0.4, easing: EASE.outCubic }),
      withTiming(0.7, { duration: MOTION.sproutGrowMs * 0.3, easing: EASE.outCubic }),
      withTiming(1, { duration: MOTION.sproutGrowMs * 0.3, easing: EASE.outCubic }),
      withDelay(MOTION.sproutHoldMs, withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })),
    );
    progress.value = withRepeat(cycle, -1, false);
    return () => cancelAnimation(progress);
  }, [refreshing, reduce, progress]);

  const stemProps = useAnimatedProps(() => {
    const stem = Math.min(1, progress.value / 0.4);
    const y = 40 - 22 * stem;
    return {
      d: `M24 40 V${y}`,
      opacity: stem > 0.05 ? 1 : 0,
    };
  });

  const leftProps = useAnimatedProps(() => {
    const t = interpolate(progress.value, [0.4, 0.7], [0, 1], 'clamp');
    return { opacity: t };
  });
  const rightProps = useAnimatedProps(() => {
    const t = interpolate(progress.value, [0.7, 1], [0, 1], 'clamp');
    return { opacity: t };
  });

  return (
    <View style={[styles.wrap, { height: size + 8 }]} accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <AnimatedPath fill="none" stroke={BRAND_LEAF} animatedProps={stemProps} />
          <AnimatedG animatedProps={leftProps}>
            <Path d="M24 28 C17 26 15 19 15 19 C21 19 24 24 24 28 Z" fill={BRAND_LEAF} />
          </AnimatedG>
          <AnimatedG animatedProps={rightProps}>
            <Path d="M24 24 C31 22 33 15 33 15 C27 15 24 20 24 24 Z" fill={BRAND_LEAF} />
          </AnimatedG>
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
