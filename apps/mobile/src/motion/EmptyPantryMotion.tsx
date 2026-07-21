/**
 * EmptyPantryMotion — static fridge + soft outward fern pulse on "+ Add item"
 * (handoff EmptyPantryState, 2.2s). Reduce-motion: no ring.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BRAND_CREAM } from '../theme/brandPalette';
import { BrandIcon } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { MOTION, MOTION_FERN } from './timing';

export function EmptyPantryMotion({
  onAdd,
  title = 'Fresh start',
  subtitle = 'Scan a barcode, snap a receipt, or add something by hand — we’ll handle the rest.',
  cta = '+ Add item',
}: {
  onAdd: () => void;
  title?: string;
  subtitle?: string;
  cta?: string;
}) {
  const reduce = useReduceMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: MOTION.emptyPulseMs, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [reduce, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: reduce ? 0 : 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <View style={styles.wrap}>
      <BrandIcon name="fridge" variant="onLight" size={64} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
      <Pressable
        onPress={onAdd}
        style={styles.buttonWrap}
        accessibilityRole="button"
        accessibilityLabel={cta}
      >
        {!reduce ? <Animated.View style={[styles.ring, ringStyle]} /> : null}
        <View style={styles.button}>
          <Text style={styles.buttonText}>{cta}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space(8),
    paddingBottom: tokens.space(10),
    gap: tokens.space(3),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 24,
    color: tokens.color.ink,
    textAlign: 'center',
  },
  sub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonWrap: { marginTop: tokens.space(2), alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: MOTION_FERN,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: MOTION_FERN,
  },
  buttonText: {
    fontFamily: tokens.font.body.semibold,
    color: BRAND_CREAM,
    fontSize: 13,
  },
});
