/**
 * SuggestChips — one horizontal row of tappable suggestion pills.
 *
 * Shared by the Add/Edit forms (kind + brand suggestions) and, next PR, the
 * Quick Add refine sheet. Progressive disclosure by design: the row only
 * renders when there are options, nothing is required, and tapping the
 * selected chip is the caller's chance to undo (toggle semantics live with
 * the caller — this component just reports picks).
 */
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { tokens } from '../../theme/tokens';

export function SuggestChips({
  options,
  selected,
  onPick,
  accessibilityPrefix,
}: {
  options: string[];
  /** The currently-active option, rendered selected (case-insensitive). */
  selected?: string | null;
  onPick: (value: string) => void;
  /** "Set kind" → a11y label "Set kind: Penne". */
  accessibilityPrefix: string;
}) {
  if (options.length === 0) return null;
  const selectedKey = selected?.trim().toLowerCase() ?? null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => {
        const isSelected = selectedKey !== null && option.trim().toLowerCase() === selectedKey;
        return (
          <Pressable
            key={option}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(option);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${accessibilityPrefix}: ${option}`}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {isSelected ? `✓ ${option}` : option}
            </Text>
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
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  chipSelected: { backgroundColor: tokens.color.accentSoft },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  chipTextSelected: { color: tokens.color.accent },
});
