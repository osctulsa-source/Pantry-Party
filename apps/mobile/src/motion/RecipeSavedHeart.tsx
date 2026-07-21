/**
 * RecipeSavedHeart — bounce + fill wipe from outline → solid on favorite toggle.
 * Reduce-motion: instant filled/outline state.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import { tokens } from '../theme/tokens';
import { BRAND_LEAF } from '../theme/brandPalette';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

const HEART =
  'M24 38 C18 33 12 28 12 21 C12 16 15.5 13 19.5 13 C22 13 23.5 14.5 24 16 C24.5 14.5 26 13 28.5 13 C32.5 13 36 16 36 21 C36 28 30 33 24 38 Z';

export function RecipeSavedHeart({
  saved,
  onToggle,
  size = 28,
}: {
  saved: boolean;
  onToggle: () => void;
  size?: number;
}) {
  const reduce = useReduceMotion();
  const bounce = useSharedValue(1);
  const fill = useSharedValue(saved ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      fill.value = saved ? 1 : 0;
      bounce.value = 1;
      return;
    }
    fill.value = withTiming(saved ? 1 : 0, {
      duration: MOTION.fillWipeMs,
      easing: EASE.outCubic,
    });
    if (saved) {
      bounce.value = withSequence(
        withTiming(1.25, { duration: 180, easing: EASE.outBack }),
        withTiming(1, { duration: 220, easing: EASE.outCubic }),
      );
    }
  }, [saved, reduce, fill, bounce]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }],
  }));

  // Approximate wipe with a bottom-up clip via overlaid filled heart + opacity.
  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scaleY: 0.35 + fill.value * 0.65 }],
  }));

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? 'Saved to favorites' : 'Save to favorites'}
    >
      <Animated.View style={[styles.wrap, { width: size, height: size }, wrapStyle]}>
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <G strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d={HEART} fill="transparent" stroke={tokens.color.ink} />
          </G>
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
          <Svg width={size} height={size} viewBox="0 0 48 48">
            <Path d={HEART} fill={BRAND_LEAF} stroke={BRAND_LEAF} strokeWidth={2.5} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
