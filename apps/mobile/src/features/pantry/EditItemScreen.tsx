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
 * unselected — saving writes the picked unit or null).
 *
 * The rest of the form is intentionally duplicated from AddItemScreen rather
 * than extracted — revisit when a third consumer appears (project doc).
 */
import { useEffect, useRef, useState } from 'react';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@powersync/react-native';

import { addDaysUTC, UNITS, type StorageLocation } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import type { PantryItemRow } from '../../data/powersync/schema';
import { ExpiryField } from './ExpiryField';
import { LocationPicker } from './LocationPicker';
import { UnitPicker } from './UnitPicker';
import type { RootStackParamList } from '../../../App';

const MAX_NAME_LENGTH = 100;

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
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<string | null>(null);
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
    setQuantity(String(item.quantity));
    setUnit(hydrateUnit(item.unit));
    setLocation(item.location);
    setExpiryDays(isoToDays(item.expires_at, new Date()));
  }, [item]);

  const trimmedName = name.trim();
  const parsedQty = parseInt(quantity, 10);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty > 0;
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH;
  const formValid = nameValid && qtyValid;

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
           SET name = ?, quantity = ?, unit = ?, location = ?, expires_at = ?, updated_at = ?
         WHERE id = ?`,
        [trimmedName, parsedQty, unit, location, expiresIso, Date.now(), itemId],
      );
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
                <ActivityIndicator color={tokens.color.surface} />
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
  submit: {
    marginTop: tokens.space(1),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.success,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.surface,
  },
  delete: {
    marginTop: tokens.space(4),
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.accent,
    alignItems: 'center',
  },
  deleteText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.accent,
  },
  missing: {
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
    textAlign: 'center',
  },
});
