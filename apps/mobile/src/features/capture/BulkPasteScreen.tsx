/**
 * BulkPasteScreen — paste-a-list / grocery-order capture.
 *
 * Typed lists (commas/newlines) and priced order dumps (Instacart, etc.) share
 * one parser. Preview is a checklist; checked rows merge into the pantry with
 * source `receipt`. Count-only `paste_add` fires on submit.
 */
import { useMemo, useState } from 'react';
import {
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
import { Check } from 'lucide-react-native';

import { parseGroceryPaste, suggestExpiryISO, suggestStorageLocation } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandLoader } from '../../components/BrandDecor';
import { addOrMergePantryItem } from '../pantry/addPantryItem';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { track } from '../../observability/analytics';
import type { RootStackParamList } from '../../../App';

const MAX_ITEMS = 50;

function qtyLabel(quantity: number, unit: string | null): string {
  return unit ? `${quantity} ${unit}` : String(quantity);
}

export function BulkPasteScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'BulkPaste'>>();
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;

  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());

  const parsed = useMemo(() => parseGroceryPaste(raw, { limit: MAX_ITEMS }), [raw]);
  const keptItems = parsed.items.filter((_, i) => !unchecked.has(i));
  const emptyParse = raw.trim().length > 0 && parsed.items.length === 0;

  function onChangeText(next: string) {
    setRaw(next);
    setUnchecked(new Set());
    setError(null);
  }

  function toggle(index: number) {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function addKept() {
    if (keptItems.length === 0 || !userId || !activeHouseholdId || busy) return;
    setError(null);
    setBusy(true);
    try {
      for (const item of keptItems) {
        const location = suggestStorageLocation(item.name) ?? 'pantry';
        await addOrMergePantryItem({
          householdId: activeHouseholdId,
          userId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          location,
          expiresIso: suggestExpiryISO({ name: item.name, location }),
          source: 'receipt',
        });
      }
      void track('paste_add', {
        parsed: parsed.items.length,
        kept: keptItems.length,
        orderDump: parsed.lookedLikeOrder,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Some items may not have been added.');
      setBusy(false);
    }
  }

  const displayError = error ?? (emptyParse ? "Couldn't find grocery items in that paste." : null);
  const addDisabled = keptItems.length === 0 || busy;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Paste a grocery order or a typed list — one per line or separated by commas. Uncheck
          anything you don't want, then add. We'll set a smart expiry for each one.
        </Text>
        <TextInput
          style={styles.area}
          multiline
          placeholder={'Milk\nEggs\nOrganic Bananas\n$1.78'}
          placeholderTextColor={tokens.color.inkMuted}
          value={raw}
          onChangeText={onChangeText}
          autoFocus
          textAlignVertical="top"
        />
        {displayError && <Text style={styles.error}>{displayError}</Text>}
        {parsed.items.map((item, index) => {
          const checked = !unchecked.has(index);
          return (
            <Pressable
              key={`${index}-${item.name}`}
              style={styles.row}
              onPress={() => toggle(index)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${item.name}, ${qtyLabel(item.quantity, item.unit)}`}
            >
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked && <Check size={12} color={tokens.color.onAccent} />}
              </View>
              <Text style={styles.rowName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.rowQty}>{qtyLabel(item.quantity, item.unit)}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.addBtn, addDisabled && styles.addBtnDisabled]}
          onPress={() => void addKept()}
          disabled={addDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Add ${keptItems.length} items to pantry`}
        >
          {busy ? (
            <BrandLoader variant="dots" size={22} />
          ) : (
            <Text style={styles.addBtnTxt}>
              {keptItems.length === 0
                ? 'Add items'
                : `Add ${keptItems.length} ${keptItems.length === 1 ? 'item' : 'items'}`}
            </Text>
          )}
        </Pressable>
        {parsed.items.length >= MAX_ITEMS && (
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.sm,
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  rowName: {
    flex: 1,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
  },
  rowQty: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
  addBtn: {
    marginTop: tokens.space(4),
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
