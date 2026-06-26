/**
 * UndoSnackbar — a small bottom toast with an Undo action and auto-dismiss.
 *
 * Presentational + controlled: the parent owns the undo payload and decides
 * when to show it. Pass `message` (null = hidden) and a `nonce` that changes
 * every time a NEW snackbar should be raised — the entrance animation and the
 * auto-dismiss timer re-fire on the nonce, so two back-to-back actions each get
 * a fresh ~4.5s window instead of the second being swallowed by the first.
 *
 * Anchored above the tab bar (absolute, bottom inset handled by the screen),
 * matching the save-toast styling introduced with Your Kitchen (#136): ink
 * surface, light text, accentSoft action. Dark-mode-free (all token colors).
 */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { tokens } from '../theme/tokens';

export function UndoSnackbar({
  message,
  nonce,
  actionLabel = 'Undo',
  duration = 4500,
  onUndo,
  onDismiss,
}: {
  message: string | null;
  nonce: number;
  actionLabel?: string;
  duration?: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 160, friction: 14 }).start();
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [nonce, message, duration, onDismiss, anim]);

  if (!message) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View
      style={[styles.wrap, { opacity: anim, transform: [{ translateY }] }]}
      accessibilityRole="alert"
    >
      <Text style={styles.message} numberOfLines={1}>
        {message}
      </Text>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onUndo();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={styles.action}>{actionLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: tokens.space(4),
    right: tokens.space(4),
    bottom: tokens.space(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.ink,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  message: {
    flex: 1,
    fontFamily: tokens.font.body.semibold,
    fontSize: 14,
    color: tokens.color.surface,
  },
  action: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 14,
    color: tokens.color.accentSoft,
  },
});
