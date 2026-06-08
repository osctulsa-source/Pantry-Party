/**
 * QuickAddScreen — one-tap add for common staples, separate from the manual
 * Add Item form. Tap chips to insert items with smart category / location /
 * expiry defaults; added chips show a ✓. Navigate back when done — the pantry
 * list is reactive and reflects additions immediately.
 *
 * Shares QuickAddStaples + addPantryItem with the onboarding flow.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { suggestExpiryISO } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from './addPantryItem';
import { QuickAddStaples } from './QuickAddStaples';
import type { Staple } from './staples';

export function QuickAddScreen() {
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userId = state.status === 'authenticated' ? state.session.user.id : null;

  async function onAdd(staple: Staple) {
    if (!userId || !activeHouseholdId || added.includes(staple.name)) return;
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: staple.name,
        quantity: 1,
        location: staple.location,
        expiresIso: staple.noExpiry ? null : suggestExpiryISO({ category: staple.category }),
        source: 'manual',
      });
      setAdded((prev) => [...prev, staple.name]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Stock the basics</Text>
        <Text style={styles.hint}>
          Tap the staples you keep on hand — we set a sensible location and expiry. Added items show a ✓.
        </Text>
        {added.length > 0 && (
          <Text style={styles.count}>
            {added.length} {added.length === 1 ? 'item' : 'items'} added
          </Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.list}>
          <QuickAddStaples added={added} onAdd={onAdd} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(10) },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 24,
    color: tokens.color.ink,
    letterSpacing: -0.4,
    marginBottom: tokens.space(1),
  },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(4),
  },
  count: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: tokens.color.accent,
    marginBottom: tokens.space(3),
  },
  error: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
    marginBottom: tokens.space(3),
  },
  list: { marginTop: tokens.space(1) },
});
