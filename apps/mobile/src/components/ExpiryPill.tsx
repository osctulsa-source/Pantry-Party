/**
 * ExpiryPill — accessible expiry status indicator.
 *
 * Double-encoded per the project's verified colorblind-safe system: a distinct SHAPE
 * (check → diamond → triangle, escalating angularity = escalating urgency) + the
 * human-readable label + a semantic color that forms a light→dark luminance ramp. Color
 * is never the only signal, so the status stays legible under red-green color-vision
 * deficiency and in grayscale.
 *
 * Shapes are drawn with RN primitives — no icon library or native module — so this is a
 * pure-JS, dependency-free addition (neither @expo/vector-icons nor react-native-svg is
 * installed). Swapping to literal vector icons (check / clock / alert) is an easy upgrade
 * once an icon dependency lands alongside the signature-font work.
 *
 * All colors come from tokens.semantic.expiry (ADR-006); fresh mirrors inkMuted so
 * non-urgent items stay calm — color appears only when something needs attention.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { ExpiryStatus } from '@breadbox/core';

import { tokens } from '../theme/tokens';

const COLOR: Record<ExpiryStatus, string> = {
  fresh: tokens.semantic.expiry.fresh,
  warning: tokens.semantic.expiry.warning,
  expired: tokens.semantic.expiry.expired,
};

function Glyph({ status, color }: { status: ExpiryStatus; color: string }) {
  if (status === 'expired') {
    // upward triangle — "alert"
    return <View style={[styles.triangle, { borderBottomColor: color }]} />;
  }
  if (status === 'warning') {
    // rotated square (diamond) — "caution"
    return <View style={[styles.diamond, { backgroundColor: color }]} />;
  }
  // fresh — checkmark (rotated L), "all good"
  return <View style={[styles.check, { borderColor: color }]} />;
}

export function ExpiryPill({ status, label }: { status: ExpiryStatus; label: string }) {
  const color = COLOR[status];
  return (
    <View style={styles.pill} accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.glyphBox}>
        <Glyph status={status} color={color} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1.5),
  },
  glyphBox: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
  },
  // fresh: a rotated box with two borders reads as a checkmark.
  check: {
    width: 5,
    height: 9,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
    marginTop: -2,
  },
  // warning: rotated square = diamond.
  diamond: {
    width: 9,
    height: 9,
    borderRadius: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  // expired: CSS-style triangle via transparent side borders.
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
