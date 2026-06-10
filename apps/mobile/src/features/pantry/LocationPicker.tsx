/**
 * LocationPicker — choose a storage location, or create a new one.
 *
 * Renders the known locations (built-in defaults + customs already in use) as
 * selectable chips, plus a "+ New" affordance that reveals an input to add a
 * custom location (e.g. "Garage", "Spice rack"). Shared by Add Item + Edit Item.
 * Location is a free string (core schema), so any label the user types is valid.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StorageLocation } from '@breadbox/core';

import { tokens } from '../../theme/tokens';
import { useKnownLocations } from './useKnownLocations';

export function LocationPicker({
  value,
  onChange,
  householdId,
}: {
  value: StorageLocation;
  onChange: (location: StorageLocation) => void;
  householdId: string | null;
}) {
  const known = useKnownLocations(householdId);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  // Always show the current value as a chip, even if it isn't in the known list yet.
  const chips = known.includes(value) ? known : [...known, value];

  function commitNew() {
    const loc = draft.trim().slice(0, 40);
    if (loc) onChange(loc);
    setDraft('');
    setAdding(false);
  }

  return (
    <View>
      <View style={styles.chips}>
        {chips.map((loc) => {
          const selected = loc === value;
          return (
            <Pressable key={loc} onPress={() => onChange(loc)} style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{loc}</Text>
            </Pressable>
          );
        })}
        {!adding && (
          <Pressable onPress={() => setAdding(true)} style={[styles.chip, styles.chipNew]}>
            <Text style={styles.chipNewText}>+ New</Text>
          </Pressable>
        )}
      </View>
      {adding && (
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="New location (e.g. Garage)"
            placeholderTextColor={tokens.color.inkMuted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commitNew}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            maxLength={40}
          />
          <Pressable style={styles.addBtn} onPress={commitNew}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(4),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.ink, textTransform: 'capitalize' },
  chipTextSelected: { color: tokens.color.onAccent },
  chipNew: { backgroundColor: 'transparent', borderWidth: 1, borderColor: tokens.color.line },
  chipNewText: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
  addRow: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(2) },
  input: {
    flex: 1,
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  addBtn: {
    paddingHorizontal: tokens.space(5),
    justifyContent: 'center',
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
  },
  addBtnText: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.onAccent },
});
