/**
 * AddItemScreen — manual pantry entry with smart expiry + custom locations.
 *
 * Quick-add staples live on their own screen (QuickAddScreen); this is the "add
 * your own" form. We suggest a "best before" from the item's name (shelf-life by
 * inferred category) and let the user adjust with ExpiryField. Location uses the
 * shared LocationPicker (built-in + custom locations). Unit is optional via the
 * shared UnitPicker (counts need no unit). Brand is optional free text (qualifies
 * the name; also feeds search + the safe-merge dedup key). Writes go through
 * addPantryItem() → PowerSync local SQLite → upload-proxy → Postgres.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  addDaysUTC,
  guideFor,
  makeRefinedName,
  plainName,
  suggestShelfLifeDays,
  type StorageLocation,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from './addPantryItem';
import { ExpiryField } from './ExpiryField';
import { LocationPicker } from './LocationPicker';
import { SuggestChips } from './SuggestChips';
import { UnitPicker } from './UnitPicker';
import { useLearnedBrands } from './useLearnedBrands';
import { QtyStepper } from './QtyStepper';
import type { RootStackParamList } from '../../../App';

const MAX_NAME_LENGTH = 100;
const MAX_BRAND_LENGTH = 120; // matches @breadbox/core PantryItem.brand max

export function AddItemScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AddItem'>>();
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<string | null>(null);
  const [location, setLocation] = useState<StorageLocation>('pantry');
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const trimmedBrand = brand.trim();
  const parsedQty = parseInt(quantity, 10);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty > 0;
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH;
  const formValid = nameValid && qtyValid && activeHouseholdId !== null;

  const suggestedDays = useMemo(() => suggestShelfLifeDays({ name: trimmedName }), [trimmedName]);
  const effectiveDays = expiryTouched ? expiryDays : suggestedDays;

  // Guided specificity: a generic food name ("pasta") surfaces its common
  // kinds as chips; a refined name ("Penne pasta") keeps the row visible with
  // that kind selected (tap again to undo). Brand chips rank the household's
  // own learned brands first, then seed common brands from the guide.
  const guideMatch = useMemo(() => guideFor(trimmedName), [trimmedName]);
  const learnedBrands = useLearnedBrands(
    activeHouseholdId,
    guideMatch ? guideMatch.guide.food : trimmedName,
  );
  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of [...learnedBrands, ...(guideMatch?.guide.brands ?? [])]) {
      const key = b.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(b);
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [learnedBrands, guideMatch]);

  function onPickKind(kind: string) {
    if (!guideMatch) return;
    setName(kind === guideMatch.activeKind ? plainName(guideMatch.guide) : makeRefinedName(guideMatch.guide, kind));
  }

  const userId = state.status === 'authenticated' ? state.session.user.id : null;

  function onChangeExpiry(days: number | null) {
    setExpiryTouched(true);
    setExpiryDays(days);
  }

  async function onSubmit() {
    if (!formValid || submitting) return;
    if (!userId) {
      setError('You must be signed in to add items.');
      return;
    }
    if (!activeHouseholdId) {
      setError('No active household selected.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: trimmedName,
        brand: trimmedBrand || null,
        quantity: parsedQty,
        unit,
        location,
        expiresIso: effectiveDays === null ? null : addDaysUTC(new Date(), effectiveDays).toISOString(),
        source: 'manual',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const expiryHint = !expiryTouched && suggestedDays !== null ? ' · suggested, adjust anytime' : '';

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Whole milk"
            placeholderTextColor={tokens.color.inkMuted}
            value={name}
            onChangeText={setName}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
          />
          {guideMatch && (
            <View style={styles.suggestWrap}>
              <Text style={styles.suggestLabel}>Which kind? (optional)</Text>
              <SuggestChips
                options={guideMatch.guide.kinds}
                selected={guideMatch.activeKind}
                onPick={onPickKind}
                accessibilityPrefix="Set kind"
              />
            </View>
          )}

          <Text style={styles.label}>Brand (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Horizon"
            placeholderTextColor={tokens.color.inkMuted}
            value={brand}
            onChangeText={setBrand}
            maxLength={MAX_BRAND_LENGTH}
            autoCapitalize="words"
          />
          {brandOptions.length > 0 && (
            <View style={styles.suggestWrap}>
              <SuggestChips
                options={brandOptions}
                selected={trimmedBrand || null}
                onPick={(b) => setBrand(b.toLowerCase() === trimmedBrand.toLowerCase() ? '' : b)}
                accessibilityPrefix="Set brand"
              />
            </View>
          )}

          <Text style={styles.label}>Quantity</Text>
          <QtyStepper value={quantity} onChange={setQuantity} />

          <Text style={styles.label}>Unit (optional)</Text>
          <View style={styles.unitWrap}>
            <UnitPicker value={unit} onChange={setUnit} />
          </View>

          <Text style={styles.label}>Location</Text>
          <View style={styles.locationWrap}>
            <LocationPicker value={location} onChange={setLocation} householdId={activeHouseholdId} />
          </View>

          <Text style={styles.label}>Best before{expiryHint}</Text>
          <View style={styles.expiryWrap}>
            <ExpiryField valueDays={effectiveDays} onChange={onChangeExpiry} />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.submit, (!formValid || submitting) && styles.submitDisabled]}
            onPress={onSubmit}
            disabled={!formValid || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={tokens.color.onAccent} />
            ) : (
              <Text style={styles.submitText}>Add to pantry</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  flex: { flex: 1 },
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(10) },
  label: {
    marginBottom: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
  input: {
    marginBottom: tokens.space(4),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  // Suggestion rows tuck under their field (inputs carry marginBottom 4).
  suggestWrap: { marginTop: -tokens.space(2), marginBottom: tokens.space(4) },
  suggestLabel: {
    marginBottom: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
  unitWrap: { marginBottom: tokens.space(4) },
  locationWrap: { marginBottom: tokens.space(4) },
  expiryWrap: { marginBottom: tokens.space(4) },
  error: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
  },
  submit: {
    marginTop: tokens.space(3),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
});
