/**
 * CookSuccessBurst — the celebration after "I made this!" completes.
 *
 * A brief animated checkmark circle that scales up from nothing, holds,
 * then shrinks into the success note text. The whole sequence is ~1.2s
 * and uses native-driver Animated (60fps). Renders in place of the old
 * plain-text cookedNote — same position, same content, more feeling.
 *
 * Self-dismissing: after the animation completes, the burst fades to the
 * static note text (the caller can also clear it via state, as before).
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../theme/tokens';

export function CookSuccessBurst({
  itemCount,
}: {
  itemCount: number;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Phase 1: checkmark circle scales in with spring + fades in
    // Phase 2: hold briefly
    // Phase 3: circle fades, text fades in
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.6, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true, delay: 100 }),
      ]),
    ]).start();
  }, [scale, opacity, textOpacity]);

  const noteText = itemCount > 0
    ? `Nice! ${itemCount} item${itemCount === 1 ? '' : 's'} used up ✓`
    : null;

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.circle,
          { transform: [{ scale }], opacity },
        ]}
      >
        <Text style={styles.check}>{'✓'}</Text>
      </Animated.View>
      {noteText && (
        <Animated.Text style={[styles.note, { opacity: textOpacity }]}>
          {noteText}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: tokens.space(6),
    marginBottom: tokens.space(2),
  },
  circle: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: tokens.color.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 22,
    color: '#FFFFFF',
  },
  note: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: tokens.color.success,
  },
});
