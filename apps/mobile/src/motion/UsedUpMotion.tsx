/**
 * UsedUpMotion — item slides out + fades while a dashed empty-slot outline fades in.
 * Drive with `exiting`; call `onExited` when the exit finishes.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION } from './timing';

export function UsedUpMotion({
  exiting,
  onExited,
  children,
  style,
}: {
  exiting: boolean;
  onExited?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!exiting) {
      progress.value = 0;
      return;
    }
    if (reduce) {
      progress.value = 1;
      onExited?.();
      return;
    }
    progress.value = withTiming(1, { duration: MOTION.slideOutMs, easing: EASE.inCubic }, (finished) => {
      if (finished && onExited) runOnJS(onExited)();
    });
  }, [exiting, reduce, progress, onExited]);

  const itemStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateX: progress.value * -48 }, { scale: 1 - progress.value * 0.08 }],
  }));
  const slotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View style={[styles.slot, slotStyle]} pointerEvents="none" />
      <Animated.View style={itemStyle}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  slot: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    borderStyle: 'dashed',
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceAlt,
  },
});
