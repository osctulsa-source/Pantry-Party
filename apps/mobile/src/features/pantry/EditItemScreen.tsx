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
 * Layout mirrors AddItemScreen's declutter pass: name hero, quantity + unit on
 * one row, brand collapsed behind "+ Add brand" (auto-expanded when the item
 * already has one), and a sticky "Save changes". Delete stays in the body —
 * a destructive action shouldn't ride the always-visible bar. The rest of the
 * form is intentionally duplicated from AddItemScreen rather than extracted —
 * revisit when a third consumer appears (project doc).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { BrandLoader } from '../../components/BrandDecor';
import { applyPantryItemEdit, tombstonePantryItems } from './pantryWrites';
import type { PantryItemRow } from '../../data/powersync/schema';
import { ExpiryField } from './ExpiryField';
import { LocationPicker } from './LocationPicker';
import { SuggestChips } from './SuggestChips';
import { UnitPicker } from './UnitPicker';
import { useLearnedBrands } from './useLearnedBrands';
import { QtyStepper } from './QtyStepper';
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
  const [showBrand, setShowBrand] = useState(false);
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
    if (item.brand) setShowBrand(true); // already has a brand → keep it visible
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
      // Store a full ISO timestamp (UTC midnight): core's PantryItem validates
      // expiresAt with .datetime(), so a bare YYYY-MM-DD would fail on read-back.
      const expiresIso = expiryDays === null ? null : addDaysUTC(new Date(), expiryDays).toISOString();

      await applyPantryItemEdit(itemId, {
        name: trimmedName,
        brand: trimmedBrand || null,
        quantity: parsedQty,
        unit,
        fillLevel,
        location,
        expiresIso,
      });
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
      // Tombstone, not a row removal — PantryScreen's `WHERE deleted = 0` hides it.
      await tombstonePantryItems([itemId]);
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
          <BrandLoader variant="dots" />
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
        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.hero}
            placeholder="e.g. Whole milk"
            placeholderTextColor={tokens.color.inkMuted}
            value={name}
            onChangeText={setName}
            maxLength={MAX_NAME_LENGTH}
          />
          {guideMatch && (
            <View style={styles.suggestWrap}>
              <Text style={styles.miniLabel}>Which kind?</Text>
              <SuggestChips
                options={guideMatch.guide.kinds}
                selected={guideMatch.activeKind}
                onPick={onPickKind}
                accessibilityPrefix="Set kind"
              />
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Quantity</Text>
              <QtyStepper value={quantity} onChange={setQuantity} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Unit</Text>
              <View style={styles.unitInline}>
                <UnitPicker value={unit} onChange={setUnit} />
              </View>
            </View>
          </View>

          <Text style={styles.label}>How full?</Text>
          <View style={styles.block}>
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
          <View style={styles.block}>
            <LocationPicker value={location} onChange={setLocation} householdId={item.household_id} />
          </View>

          <Text style={styles.label}>Best before</Text>
          <View style={styles.block}>
            <ExpiryField valueDays={expiryDays} onChange={setExpiryDays} />
          </View>

          {showBrand ? (
            <>
              <Text style={styles.label}>Brand</Text>
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
            </>
          ) : (
            <Pressable
              style={styles.addBrand}
              onPress={() => setShowBrand(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a brand"
            >
              <Text style={styles.addBrandTxt}>＋ Add brand</Text>
            </Pressable>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.delete} onPress={onDeletePress} disabled={submitting}>
            <Text style={styles.deleteText}>Delete item</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.submit, (!formValid || submitting) && styles.submitDisabled]}
            onPress={onSave}
            disabled={!formValid || submitting}
          >
            {submitting ? (
              <BrandLoader variant="dots" size={22} />
            ) : (
              <Text style={styles.submitText}>Save changes</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: tokens.space(6) },
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(8) },
  hero: {
    marginBottom: tokens.space(3),
    paddingVertical: tokens.space(4),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surface,
    borderWidth: 1.5,
    borderColor: tokens.color.accent,
    borderRadius: tokens.radius.lg,
    fontFamily: tokens.font.body.semibold,
    fontSize: 22,
    color: tokens.color.ink,
  },
  miniLabel: {
    marginBottom: tokens.space(2),
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
  },
  suggestWrap: { marginBottom: tokens.space(4) },
  row: { flexDirection: 'row', gap: tokens.space(3), marginBottom: tokens.space(2) },
  col: { flex: 1 },
  unitInline: { justifyContent: 'center' },
  label: {
    marginBottom: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
  block: { marginBottom: tokens.space(4) },
  input: {
    marginBottom: tokens.space(2),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  addBrand: { paddingVertical: tokens.space(3), alignItems: 'flex-start' },
  addBrandTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
  error: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
  },
  // Destructive action reads destructive: semantic red outline, not brand
  // accent. Lives in the scroll body, not the sticky bar.
  delete: {
    marginTop: tokens.space(5),
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.semantic.expiry.expired,
    alignItems: 'center',
  },
  deleteText: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.semantic.expiry.expired },
  missing: { fontFamily: tokens.font.body.regular, fontSize: 15, color: tokens.color.inkMuted, textAlign: 'center' },
  footer: {
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  submit: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
});
