/**
 * AddItemScreen — faster manual entry.
 *
 * Two improvements over the v1 form:
 *  1. Smart expiry: we suggest a "best before" from the item's name (shelf-life
 *     by inferred category, @breadbox/core) and let the user adjust with quick
 *     presets + ±1-day steppers (ExpiryField) — no native date picker needed.
 *  2. Quick-add staples: one tap to add common items (flour, sugar, oils,
 *     sauces, rice…) with sensible category / location / expiry defaults.
 *
 * Writes go through the shared addPantryItem() helper → PowerSync local SQLite →
 * uploadData() drains to the upload-proxy → Postgres (offline-first, PR #9).
 * household_id comes from ActiveHouseholdContext. All values come from tokens.
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

import { StorageLocation, addDaysUTC, suggestExpiryISO, suggestShelfLifeDays } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from './addPantryItem';
import { ExpiryField } from './ExpiryField';
import { STAPLE_GROUPS, type Staple } from './staples';
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
  const [added, setAdded] = useState<string[]>([]);

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

  async function onQuickAdd(staple: Staple) {
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

  const expiryHint = !expiryTouched && suggestedDays !== null ? ' · suggested, adjust anytime' : '';

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Quick add</Text>
          <Text style={styles.sectionHint}>Tap to add common staples — we set a sensible location and expiry.</Text>
          {STAPLE_GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <View style={styles.chips}>
                {group.items.map((s) => {
                  const isAdded = added.includes(s.name);
                  return (
                    <Pressable
                      key={s.name}
                      onPress={() => onQuickAdd(s)}
                      disabled={isAdded}
                      style={[styles.staple, isAdded && styles.stapleAdded]}
                    >
                      <Text style={[styles.stapleTxt, isAdded && styles.stapleTxtAdded]}>
                        {isAdded ? `✓ ${s.name}` : `+ ${s.name}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Add your own</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Whole milk"
            placeholderTextColor={tokens.color.inkMuted}
            value={name}
            onChangeText={setName}
            maxLength={MAX_NAME_LENGTH}
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
          <ExpiryField valueDays={effectiveDays} onChange={onChangeExpiry} />

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
  sectionTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(1),
  },
  sectionHint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(4),
    lineHeight: 18,
  },
  group: { marginBottom: tokens.space(4) },
  groupTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  staple: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stapleAdded: { backgroundColor: tokens.color.accentSoft },
  stapleTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  stapleTxtAdded: { color: tokens.color.accent },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.color.line,
    marginVertical: tokens.space(6),
  },
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
  error: {
    marginTop: tokens.space(3),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
  },
  submit: {
    marginTop: tokens.space(5),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
});
