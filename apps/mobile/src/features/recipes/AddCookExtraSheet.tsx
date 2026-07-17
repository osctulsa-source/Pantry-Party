/**
 * AddCookExtraSheet — "Add something else you used" picker, layered on top
 * of CookedItSheet. Search-filters the household pantry down to items not
 * already showing as a row (see filterAddableItems); picking one hands the
 * chosen PantryItem back to the caller, which appends it as a normal sheet
 * row. Pure UI — no writes happen here.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PantryItem } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { filterAddableItems } from './filterAddableItems';

export function AddCookExtraSheet({
  pantryItems,
  alreadyShownIds,
  onPick,
  onClose,
}: {
  pantryItems: PantryItem[];
  alreadyShownIds: ReadonlySet<string>;
  onPick: (item: PantryItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = filterAddableItems(pantryItems, alreadyShownIds, query);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <Text style={styles.title}>Add something else you used</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your pantry"
            placeholderTextColor={tokens.color.inkMuted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            accessibilityLabel="Search your pantry"
          />
          {results.length === 0 ? (
            <Text style={styles.emptyTxt}>No matching pantry items.</Text>
          ) : (
            <ScrollView style={styles.results} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {results.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onPick(item)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.name}`}
                >
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                    {item.quantity > 1 ? `  ×${item.quantity}` : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(8),
    maxHeight: '80%',
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 18,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    marginBottom: tokens.space(3),
  },
  input: {
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: tokens.space(3),
  },
  results: { flexGrow: 0 },
  row: {
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowPressed: { opacity: 0.6 },
  rowName: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  emptyTxt: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    paddingVertical: tokens.space(4),
  },
  cancel: {
    marginTop: tokens.space(2),
    paddingVertical: tokens.space(3),
    alignItems: 'center',
  },
  cancelTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
});
