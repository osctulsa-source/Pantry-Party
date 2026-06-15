/**
 * BulkPasteScreen — paste-a-list capture (the interim receipt path).
 *
 * Paste or type names separated by newlines / commas / semicolons; the parser
 * trims, dedupes (case-insensitive), and caps at 50. One tap batch-adds every
 * row via addPantryItem with the smart-expiry suggester (source 'manual').
 * Receipt OCR (October, dataset-gated) replaces typing with a photo — this
 * screen is its honest stand-in until then.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { suggestExpiryISO } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { addPantryItem } from '../pantry/addPantryItem';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../../../App';

const MAX_ITEMS = 50;

function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n,;]+/)) {
    const name = piece.trim().slice(0, 100);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function BulkPasteScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'BulkPaste'>>();
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;

  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => parseNames(raw), [raw]);

  async function addAll() {
    if (names.length === 0 || !userId || !activeHouseholdId || busy) return;
    setError(null);
    setBusy(true);
    try {
      for (const name of names) {
        await addPantryItem({
          householdId: activeHouseholdId,
          userId,
          name,
          quantity: 1,
          location: 'pantry',
          expiresIso: suggestExpiryISO({ name }),
          source: 'manual',
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Some items may not have been added.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Paste what you bought — one per line or separated by commas. We'll set a smart expiry for
          each one.
        </Text>
        <TextInput
          style={styles.area}
          multiline
          placeholder={'Milk\nEggs\nPenne pasta\nSalsa'}
          placeholderTextColor={tokens.color.inkMuted}
          value={raw}
          onChangeText={setRaw}
          autoFocus
          textAlignVertical="top"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.addBtn, (names.length === 0 || busy) && styles.addBtnDisabled]}
          onPress={() => void addAll()}
          disabled={names.length === 0 || busy}
          accessibilityRole="button"
          accessibilityLabel={`Add ${names.length} items to pantry`}
        >
          {busy ? (
            <ActivityIndicator color={tokens.color.onAccent} />
          ) : (
            <Text style={styles.addBtnTxt}>
              {names.length === 0
                ? 'Add items'
                : `Add ${names.length} ${names.length === 1 ? 'item' : 'items'}`}
            </Text>
          )}
        </Pressable>
        {names.length >= MAX_ITEMS && (
          <Text style={styles.cap}>Capped at {MAX_ITEMS} per batch — add the rest in a second pass.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(10) },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(4),
  },
  area: {
    minHeight: 180,
    padding: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: tokens.space(4),
  },
  error: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
    marginBottom: tokens.space(3),
  },
  addBtn: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  cap: {
    marginTop: tokens.space(3),
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
    textAlign: 'center',
  },
});
