/**
 * GroceryCheckOff — checkbox fill + drawn strikethrough + row fades to 40%.
 * Reduce-motion: end-state only (checked look, no draw).
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BRAND_CREAM, BRAND_LEAF } from '../theme/brandPalette';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

export function GroceryCheckOff({
  checked,
  name,
  meta,
  onToggle,
  trailing,
}: {
  checked: boolean;
  name: string;
  meta?: string;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  const fill = useSharedValue(checked ? 1 : 0);
  const strike = useSharedValue(checked ? 1 : 0);
  const dim = useSharedValue(checked ? 0.4 : 1);

  useEffect(() => {
    if (reduce) {
      fill.value = checked ? 1 : 0;
      strike.value = checked ? 1 : 0;
      dim.value = checked ? 0.4 : 1;
      return;
    }
    fill.value = withTiming(checked ? 1 : 0, {
      duration: MOTION.fillWipeMs,
      easing: EASE.outCubic,
    });
    strike.value = withDelay(
      checked ? 80 : 0,
      withTiming(checked ? 1 : 0, { duration: 280, easing: EASE.outCubic }),
    );
    dim.value = withTiming(checked ? 0.4 : 1, { duration: 280, easing: EASE.outCubic });
  }, [checked, reduce, fill, strike, dim]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: fill.value > 0.5 ? BRAND_LEAF : 'transparent',
    borderColor: fill.value > 0.5 ? BRAND_LEAF : tokens.color.line,
    transform: [{ scale: 0.92 + fill.value * 0.08 }],
  }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const strikeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: strike.value }],
    opacity: strike.value,
  }));
  const rowStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ checked }}
      accessibilityLabel={`${name}${checked ? ', in the cart' : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Animated.View style={[styles.checkbox, boxStyle]}>
        <Animated.Text style={[styles.checkmark, checkStyle]}>✓</Animated.Text>
      </Animated.View>
      <Animated.View style={[styles.main, rowStyle]}>
        <View>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Animated.View style={[styles.strike, strikeStyle]} />
        </View>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </Animated.View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surface,
  },
  rowPressed: { opacity: 0.85 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 14,
    color: BRAND_CREAM,
    marginTop: -1,
  },
  main: { flex: 1, gap: 2 },
  name: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.ink,
  },
  strike: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    backgroundColor: tokens.color.inkMuted,
    transformOrigin: 'left center',
  },
  meta: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
});
