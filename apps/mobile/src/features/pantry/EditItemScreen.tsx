/**
 * EditItemScreen — edit or delete an existing pantry item.
 *
 * Reads the target row reactively via useQuery (single row by id) and pre-fills
 * the form once it resolves. Save writes an UPDATE through PowerSync's local
 * SQLite (drained to Postgres by the upload-proxy's PATCH handler); Delete is a
 * tombstone — UPDATE deleted = 1 — so PantryScreen's `WHERE deleted = 0` filter
 * hides it without an actual row removal.
 *
 * Expiry uses the shared ExpiryField (presets + steppers), matching Add Item.
 * The stored ISO date ↔ days-from-today conversion happens here: isoToDays on
 * hydrate, addDaysUTC on save. An already-expired item hydrates to a negative
 * day count (ExpiryField renders "N days ago").
 *
 * Location uses the shared LocationPicker (built-in defaults + custom locations
 * already in use across the household). Location is a free string in core, so an
 * item stored under a custom location ("Garage") hydrates and re-saves as-is.
 *
 * Unit uses the shared UnitPicker (optional; legacy free-text units hydrate as
 * unselected — saving writes the picked unit or null). Brand is optional free
 * text (matches Add Item; brand is PATCH-allowed on the upload-proxy).
 *
 * The rest of the form is intentionally duplicated from AddItemScreen rather
 * than extracted — revisit when a third consumer appears (project doc).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@powersync/react-native';

import {
  addDaysUTC,
  guideFor,
  makeRefinedName,
  plainName,
  UNITS,
  type StorageLocation,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import type { PantryItemRow } from '../../data/powersync/schema';
import { ExpiryField } from './ExpiryField';
import { LocationPicker } from './LocationPicker';
import { SuggestChips } from './SuggestChips';
import { UnitPicker } from './UnitPicker';
import { useLearnedBrands } from './useLearnedBrands';
import type { RootStackParamList } from '../../../App';

const MAX_NAME_LENGTH = 100;
const MAX_BRAND_LENGTH = 120; // matches @breadbox/core PantryItem.brand max

// Fill-level steps offered by "How full?". Stored as 1/.75/.5/.25; null =
// not tracked — the pantry row's mini bar renders only once a level is set
// (opt-in), and tapping the selected chip clears back to untracked.
const FILL_STEPS: Array<{ label: string; value: number }> = [
  { label: 'Full', value: 1 },
  { label: '¾', value: 0.75 },
  { label: '½', value: 0.5 },
  { label: '¼', value: 0.25 },
];

// Stored ISO expiry → whole days from today (UTC-midnight basis, the inverse of
// addDaysUTC). Negative when the item is already past its date.
function isoToDays(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

// Legacy rows may hold free-text units ("gal", "fl oz"). The picker only
// renders canonical UNITS, so anything else hydrates as unselected — saving
// then writes the picked unit or null. Non-destructive for untouched rows in
// the common case (user edits name/qty and the unit was already canonical).
function hydrateUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (UNITS as readonly string[]).includes(raw) ? raw : null;
}

export function EditItemScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'EditItem'>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EditItem'>>();
  const { itemId } = params;

  const { data: rows, isLoading } = useQuery<PantryItemRow>(
    'SELECT * FROM pantry_items WHERE id = ? LIMIT 1',
    [itemId],
  );
  const item = rows[0];

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<string | null>(null);
  const [fillLevel, setFillLevel] = useState<number | null>(null);
  const [location, setLocation] = useState<StorageLocation>('pantry');
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill once. The query is reactive, but re-hydrating on every emission
  // would clobber in-progress edits (e.g. a background sync touching the row).
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !item) return;
    hydrated.current = true;
    setName(item.name);
    setBrand(item.brand ?? '');
    setQuantity(String(item.quantity));
    setUnit(hydrateUnit(item.unit));
    setFillLevel(item.fill_level ?? null);
    setLocation(item.location);
    setExpiryDays(isoToDays(item.expires_at, new Date()));
  }, [item]);

  const trimmedName = name.trim();
  const trimmedBrand = brand.trim();
  const parsedQty = parseInt(quantity, 10);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty > 0;
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH;
  const formValid = nameValid && qtyValid;

  // Guided specificity — same treatment as Add Item (kind chips when the name
  // is a known generic food or a refined form of one; brand chips = household
  // learned brands first, then the guide's seeds). Hooks run unconditionally;
  // household id comes from the loaded row once it resolves.
  const guideMatch = useMemo(() => guideFor(trimmedName), [trimmedName]);
  const learnedBrands = useLearnedBrands(
    item?.household_id ?? null,
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

  async function onSave() {
    if (!formValid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const db = getPowerSync();

      // Store a full ISO timestamp (UTC midnight): core's PantryItem validates
      // expiresAt with .datetime(), so a bare YYYY-MM-DD would fail on read-back.
      const expiresIso = expiryDays === null ? null : addDaysUTC(new Date(), expiryDays).toISOString();

      await db.execute(
        `UPDATE pantry_items
           SET name = ?, brand = ?, quantity = ?, unit = ?, fill_level = ?, location = ?, expires_at = ?, updated_at = ?
         WHERE id = ?`,
        [trimmedName, trimmedBrand || null, parsedQty, unit, fillLevel, location, expiresIso, Date.now(), itemId],
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message);
      setSubmitting(false);
    }
  }

  function onDeletePress() {
    Alert.alert('Delete item?', 'This will remove it from your pantry.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
    ]);
  }

  async function handleDelete() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const db = getPowerSync();
      // Tombstone, not a row removal — PantryScreen's `WHERE deleted = 0` hides it.
      await db.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [
        Date.now(),
        itemId,
      ]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      navigation.goBack();
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (isLoading && !item) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // Defensive — navigation always passes a live id, but the row could vanish
  // (e.g. deleted on another device) between tap and render.
  if (!item) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.missing}>This item is no longer in your pantry.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.center}>
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Whole milk"
              placeholderTextColor={tokens.color.inkMuted}
              value={name}
              onChangeText={setName}
              maxLength={MAX_NAME_LENGTH}
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
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor={tokens.color.inkMuted}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Unit (optional)</Text>
            <View style={styles.unitWrap}>
              <UnitPicker value={unit} onChange={setUnit} />
            </View>

            <Text style={styles.label}>How full? (optional)</Text>
            <View style={styles.unitWrap}>
              <SuggestChips
                options={FILL_STEPS.map((s) => s.label)}
                selected={FILL_STEPS.find((s) => s.value === fillLevel)?.label ?? null}
                onPick={(label) => {
                  const step = FILL_STEPS.find((s) => s.label === label);
                  if (!step) return;
                  setFillLevel(step.value === fillLevel ? null : step.value);
                }}
                accessibilityPrefix="Set fill level"
              />
            </View>

            <Text style={styles.label}>Location</Text>
            <View style={styles.locationWrap}>
              <LocationPicker value={location} onChange={setLocation} householdId={item.household_id} />
            </View>

            <Text style={styles.label}>Best before</Text>
            <View style={styles.expiryWrap}>
              <ExpiryField valueDays={expiryDays} onChange={setExpiryDays} />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.submit, (!formValid || submitting) && styles.submitDisabled]}
              onPress={onSave}
              disabled={!formValid || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.color.onAccent} />
              ) : (
                <Text style={styles.submitText}>Save changes</Text>
              )}
            </Pressable>

            <Pressable style={styles.delete} onPress={onDeletePress} disabled={submitting}>
              <Text style={styles.deleteText}>Delete item</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.space(6),
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
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
  // Suggestion rows tuck under their field (inputs carry marginBottom 4).
  suggestWrap: { marginTop: -tokens.space(2), marginBottom: tokens.space(4) },
  suggestLabel: {
    marginBottom: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
  unitWrap: {
    marginBottom: tokens.space(4),
  },
  locationWrap: {
    marginBottom: tokens.space(4),
  },
  expiryWrap: {
    marginBottom: tokens.space(4),
  },
  error: {
    marginBottom: tokens.space(3),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
  },
  // Save matches Add Item's primary (accent + onAccent) — the two sibling
  // forms previously used two different greens (success vs accent).
  submit: {
    marginTop: tokens.space(1),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.onAccent,
  },
  // Destructive action reads destructive: semantic red outline, not brand
  // accent (a leftover from the oxblood era, when accent WAS red).
  delete: {
    marginTop: tokens.space(4),
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.semantic.expiry.expired,
    alignItems: 'center',
  },
  deleteText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.semantic.expiry.expired,
  },
  missing: {
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
    textAlign: 'center',
  },
});
