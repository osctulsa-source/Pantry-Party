/**
 * QtyStepper — a tap-friendly quantity control for the Add/Edit item forms.
 *
 * Replaces a bare number-pad TextInput: − and + buttons (with a selection
 * haptic) flank an editable value, so the common case (1 → 2 → 3) is a tap and
 * big quantities can still be typed. Clamps to [min, max] and only ever emits
 * whole numbers from the steppers; typing passes straight through so the
 * parent's existing validation is unchanged. Styling matches the form inputs
 * (surfaceAlt field, accent controls).
 */
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 999,
}: {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
}) {
  const parsed = parseInt(value, 10);
  const n = Number.isInteger(parsed) ? parsed : min;
  const canDec = n > min;
  const canInc = n < max;

  function step(delta: number) {
    const next = Math.min(max, Math.max(min, n + delta));
    if (next === n && Number.isInteger(parsed)) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(String(next));
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => step(-1)}
        disabled={!canDec}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, !canDec && styles.btnDisabled]}
      >
        <Minus size={18} color={tokens.color.accent} />
      </Pressable>
      <TextInput
        style={styles.value}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        textAlign="center"
        maxLength={4}
        selectTextOnFocus
        accessibilityLabel="Quantity"
      />
      <Pressable
        onPress={() => step(1)}
        disabled={!canInc}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, !canInc && styles.btnDisabled]}
      >
        <Plus size={18} color={tokens.color.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
  },
  btn: {
    width: 54,
    paddingVertical: tokens.space(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { backgroundColor: tokens.color.accentSoft },
  btnDisabled: { opacity: 0.35 },
  value: {
    flex: 1,
    paddingVertical: tokens.space(3),
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.ink,
  },
});
