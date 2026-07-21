/**
 * StreakMilestone — flame + expanding ring burst + count-up number (one-shot).
 * Reduce-motion: final count, static flame (no burst).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import { BrandIcon } from '../components/BrandIcon';
import { useReduceMotion } from '../components/useReduceMotion';
import { EASE, MOTION, MOTION_FERN } from './timing';

export function StreakMilestone({
  days,
  play = true,
  style,
  compact = false,
}: {
  days: number;
  /** When false, shows static end-state without replaying the burst. */
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const reduce = useReduceMotion();
  const ring = useSharedValue(0);
  const pop = useSharedValue(reduce ? 1 : 0.85);
  const [display, setDisplay] = useState(reduce || !play ? days : 0);

  useEffect(() => {
    if (!play || days < 1) {
      setDisplay(days);
      return;
    }
    if (reduce) {
      setDisplay(days);
      return;
    }
    setDisplay(0);
    ring.value = 0;
    pop.value = 0.85;
    pop.value = withSequence(
      withTiming(1.12, { duration: 280, easing: EASE.outBack }),
      withTiming(1, { duration: 200, easing: EASE.outCubic }),
    );
    ring.value = withDelay(
      80,
      withTiming(1, { duration: MOTION.burstMs, easing: Easing.out(Easing.cubic) }),
    );

    const duration = Math.min(800, Math.max(280, days * 60));
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setDisplay(Math.round(t * days));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [days, play, reduce, ring, pop]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.3, 1], [0.55, 0.35, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.6, 1.85]) }],
  }));

  const flameSize = compact ? 22 : 44;

  return (
    <View style={[compact ? styles.compact : styles.wrap, style]} accessibilityLabel={`${days} day streak`}>
      <View style={compact ? styles.flameStageCompact : styles.flameStage}>
        {!compact ? <Animated.View style={[styles.ring, ringStyle]} /> : null}
        <Animated.View style={flameStyle}>
          <BrandIcon name="flame" variant="onLight" size={flameSize} />
        </Animated.View>
      </View>
      <Text style={compact ? styles.countCompact : styles.count}>{display}</Text>
      {!compact ? (
        <Text style={styles.label}>
          {days === 1 ? 'day without wasting food' : 'days without wasting food'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(4),
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flameStage: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameStageCompact: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: MOTION_FERN,
  },
  count: {
    fontFamily: tokens.font.display.bold,
    fontSize: 48,
    color: tokens.color.ink,
    fontVariant: ['tabular-nums'],
  },
  countCompact: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    color: tokens.color.accent,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
    textAlign: 'center',
  },
});
