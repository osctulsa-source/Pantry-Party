/**
 * FavoriteStoresScreen — pick grocery chains and add custom local store names.
 *
 * Saved per-user on-device (AsyncStorage). Used by text OCR to detect your store
 * on a receipt and filter chain-specific noise.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { STORE_CHAINS } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { Body, Button, Caption, Input, Screen } from '../../components/ui';
import { SuggestChips } from '../pantry/SuggestChips';
import { useAuth } from '../auth/AuthContext';
import { useFavoriteStores } from './useFavoriteStores';

export function FavoriteStoresScreen() {
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const { stores, addChain, addCustom, remove, maxFavorites } = useFavoriteStores(userId);
  const [customDraft, setCustomDraft] = useState('');

  const chainSuggestions = useMemo(() => {
    const picked = new Set(stores.map((s) => s.id));
    return STORE_CHAINS.filter((c) => !picked.has(c.id)).map((c) => c.name);
  }, [stores]);

  function onAddCustom() {
    addCustom(customDraft);
    setCustomDraft('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Body tone="muted" size={14}>
          Tell us where you shop — chains you use and any local stores in your area. We'll use this
          to improve receipt and label scanning later.
        </Body>

        <View style={styles.section}>
          <Caption>Your picks ({stores.length}/{maxFavorites})</Caption>
          {stores.length === 0 ? (
            <Body tone="muted" size={14}>
              No stores yet — tap a chain below or add a local name.
            </Body>
          ) : (
            <View style={styles.pickedList}>
              {stores.map((store) => (
                <View key={store.id} style={styles.pickedRow}>
                  <Text style={styles.pickedName}>{store.name}</Text>
                  <Pressable
                    onPress={() => remove(store.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${store.name}`}
                  >
                    <X size={18} color={tokens.color.inkMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {chainSuggestions.length > 0 && stores.length < maxFavorites && (
          <View style={styles.section}>
            <Caption>Add a chain</Caption>
            <SuggestChips
              options={chainSuggestions}
              onPick={(label) => {
                const chain = STORE_CHAINS.find((c) => c.name === label);
                if (chain) addChain(chain.id);
              }}
              accessibilityPrefix="Add store"
            />
          </View>
        )}

        {stores.length < maxFavorites && (
          <View style={styles.section}>
            <Caption>Local store</Caption>
            <Input
              value={customDraft}
              onChangeText={setCustomDraft}
              placeholder="e.g. Joe's Market on 5th"
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onAddCustom}
              maxLength={60}
            />
            <Button
              title="Add local store"
              onPress={onAddCustom}
              disabled={customDraft.trim().length === 0}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: tokens.space(6),
    paddingBottom: tokens.space(8),
    gap: tokens.space(6),
  },
  section: {
    gap: tokens.space(2),
  },
  pickedList: {
    gap: tokens.space(2),
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
  },
  pickedName: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 15,
    color: tokens.color.ink,
    flex: 1,
  },
});
