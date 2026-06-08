/**
 * AddItemScreen — manual pantry entry with smart expiry.
 *
 * Quick-add staples now live on their own screen (QuickAddScreen); this screen
 * is the "add your own" form. We still suggest a "best before" from the item's
 * name (shelf-life by inferred category, @breadbox/core) and let the user adjust
 * with ExpiryField (presets + ±1-day steppers). Writes go through addPantryItem()
 * → PowerSync local SQLite → upload-proxy → Postgres (offline-first).
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { StorageLocation, addDaysUTC, suggestShelfLifeDays } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from './addPantryItem';
import { ExpiryField } from './ExpiryField';
import type { RootStackParamList } from '../../../App';

const MAX_NAME_LENGTH = 100;
const LOCATIONS = StorageLocation.options;
type Location = (typeof LOCATIONS)[number];

export function AddItemScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AddItem'>>();
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState<Location>('pantry');
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const parsedQty = parseInt(quantity, 10);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty > 0;
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH;
  const formValid = nameValid && qtyValid && activeHouseholdId !== null;

  // Smart default: infer shelf life from the name until the user picks their own.
  const suggestedDays = useMemo(() => suggestShelfLifeDays({ name: trimmedName }), [trimmedName]);
  const effectiveDays = expiryTouched ? expiryDays : suggestedDays;

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
        quantity: parsedQty,
        location,
        expiresIso: effectiveDays === null ? null : addDaysUTC(new Date(), effectiveDays).toISOString(),
        source: 'manual',
      });
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

          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            placeholder="1"
            placeholderTextColor={tokens.color.inkMuted}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Location</Text>
          <View style={styles.segmented}>
            {LOCATIONS.map((loc) => {
              const selected = loc === location;
              return (
                <Pressable
                  key={loc}
                  onPress={() => setLocation(loc)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{loc}</Text>
                </Pressable>
              );
            })}
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
              <Text style={styles.submitText}>Add item</Text>
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
  segmented: { flexDirection: 'row', marginBottom: tokens.space(4), gap: tokens.space(2) },
  segment: {
    flex: 1,
    paddingVertical: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  segmentSelected: { backgroundColor: tokens.color.accent },
  segmentText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textTransform: 'capitalize',
  },
  segmentTextSelected: { color: tokens.color.onAccent },
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
