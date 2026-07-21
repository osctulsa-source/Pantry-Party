/**
 * SyncBeacon — PowerSync status (handoff). Offline: cream + fern ring + breath.
 * Offline→online: 700ms rotate+scale snap to solid fern. Reduce-motion: static.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { BRAND_CREAM } from '../theme/brandPalette';
import { tokens } from '../theme/tokens';
import { useReduceMotion } from '../components/useReduceMotion';
import { MOTION, MOTION_FERN } from './timing';

export type SyncBeaconState = 'offline' | 'syncing' | 'online';

export function SyncBeacon({
  state,
  size = 10,
}: {
  state: SyncBeaconState;
  size?: number;
}) {
  const reduce = useReduceMotion();
  const breathe = useSharedValue(0);
  const snap = useSharedValue(state === 'online' || state === 'syncing' ? 1 : 0);
  const prev = useRef(state);

  // Map handoff online/offline; "syncing" keeps online color without re-snap.
  const handoffStatus: 'online' | 'offline' = state === 'offline' ? 'offline' : 'online';

  useEffect(() => {
    if (handoffStatus === 'offline' && !reduce) {
      breathe.value = withRepeat(
        withTiming(1, { duration: MOTION.syncBreathMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = 0;
    }

    if (prev.current === 'offline' && handoffStatus === 'online' && !reduce) {
      snap.value = 0;
      snap.value = withTiming(1, {
        duration: MOTION.syncSnapMs,
        easing: Easing.out(Easing.cubic),
      });
    } else if (handoffStatus === 'online') {
      snap.value = 1;
    }
    prev.current = state;
  }, [state, handoffStatus, reduce, breathe, snap]);

  const style = useAnimatedStyle(() => {
    if (handoffStatus === 'offline') {
      return {
        backgroundColor: BRAND_CREAM,
        opacity: reduce ? 0.7 : 0.55 + breathe.value * 0.35,
        transform: [{ scale: reduce ? 0.92 : 0.92 + breathe.value * 0.08 }],
      };
    }
    const fill = state === 'syncing' ? tokens.semantic.expiry.warning : MOTION_FERN;
    return {
      backgroundColor: fill,
      opacity: 1,
      transform: [
        { scale: 0.85 + Math.min(snap.value, 1) * 0.15 },
        { rotate: `${snap.value * 360}deg` },
      ],
    };
  });

  const label = state === 'offline' ? 'Offline' : state === 'syncing' ? 'Syncing' : 'Synced';

  return (
    <View style={styles.wrap} accessibilityLabel={`Sync status: ${label}`}>
      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          handoffStatus === 'offline' && styles.ring,
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  dot: {},
  ring: { borderWidth: 1.5, borderColor: MOTION_FERN },
});
