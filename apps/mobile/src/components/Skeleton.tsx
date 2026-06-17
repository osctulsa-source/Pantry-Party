/**
 * Skeleton — a single pulsing placeholder block for loading states.
 *
 * Pass sizing via `style` (width / height / borderRadius). It renders a
 * surfaceAlt block with a gentle native-driver opacity pulse (~1.4s loop), so
 * loading screens feel alive and hint at the shape of what's coming instead of
 * a bare spinner. Compose several of these to mirror a real layout.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '../theme/tokens';

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.block, style, { opacity: pulse }]} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.sm,
  },
});
