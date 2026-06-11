/**
 * UnitPicker — horizontal chip row for quantity units (July quick-strike).
 *
 * Optional by design: a pantry counts most things ("2 ct" is noise next to
 * "2 Bananas"), so no unit is the default and tapping the selected chip
 * clears it. The chip list is @breadbox/core's canonical UNITS; the column
 * stays free-text-tolerant for legacy rows (see schema.ts).
 *
 * Pattern matches LocationPicker / meal chips: surfaceAlt chips, accent
 * selection, horizontal scroll.
 */
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { UNITS } from '@breadbox/core';
import { tokens } from '../../theme/tokens';

export function UnitPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (unit: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {UNITS.map((u) => {
        const selected = value === u;
        return (
          <Pressable
            key={u}
            onPress={() => onChange(selected ? null : u)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityLabel={`Unit ${u}`}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.txt, selected && styles.txtSelected]}>{u}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: tokens.space(2), paddingRight: tokens.space(4) },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  txt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  txtSelected: { color: tokens.color.onAccent },
});
