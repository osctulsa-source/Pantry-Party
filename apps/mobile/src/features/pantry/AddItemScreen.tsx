/**
 * AddItemScreen — manual pantry entry (PR #8b).
 *
 * Writes go through PowerSync's local SQLite: db.execute() inserts a row, which
 * PowerSync captures in its CRUD queue; uploadData() (PR #9) drains it to the
 * upload-proxy → Postgres. We never POST to /sync/upload directly — that would
 * bypass the offline-first guarantee.
 *
 * household_id comes from ActiveHouseholdContext (PR C) — replaces the PR #8b
 * inline user_households lookup, which arbitrarily picked the first
 * membership and broke for multi-household users. Styling mirrors SignInScreen:
 * centered card, generous padding, green submit button. All values come from tokens.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';

import { StorageLocation } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import type { RootStackParamList } from '../../../App';

const MAX_NAME_LENGTH = 100;
// Plain text input for v1 — basic shape check only. Polish PR can add a real picker.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Drives the segmented control; comes straight from the canonical core enum so
// the values always survive parsePantryItem on read-back.
const LOCATIONS = StorageLocation.options;
type Location = (typeof LOCATIONS)[number];

export function AddItemScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AddItem'>>();
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [location, setLocation] = useState<Location>('pantry');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const parsedQty = parseInt(quantity, 10);
  const qtyValid = Number.isInteger(parsedQty) && parsedQty > 0;
  const trimmedExpiry = expiresAt.trim();
  const expiryValid = trimmedExpiry === '' || ISO_DATE.test(trimmedExpiry);
  const nameValid = trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH;
  // Defensive — activeHouseholdId should be set by the time the user navigates
  // here (PantryScreen gates its own render on it), but if context bootstrap
  // somehow hasn't completed, disable submit instead of risking a NOT NULL
  // constraint violation on insert.
  const formValid = nameValid && qtyValid && expiryValid && activeHouseholdId !== null;

  async function onSubmit() {
    if (!formValid || submitting) return;
    if (state.status !== 'authenticated') {
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
      const db = getPowerSync();
      const userId = state.session.user.id;

      // Store a full ISO timestamp: core's PantryItem validates expiresAt with
      // .datetime(), so a bare YYYY-MM-DD would fail on read-back.
      const expiresIso = trimmedExpiry
        ? new Date(`${trimmedExpiry}T00:00:00.000Z`).toISOString()
        : null;

      await db.execute(
        `INSERT INTO pantry_items
           (id, household_id, name, quantity, location, expires_at, added_at, source, added_by, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          activeHouseholdId,
          trimmedName,
          parsedQty,
          location,
          expiresIso,
          new Date().toISOString(),
          'manual',
          userId,
          Date.now(), // epoch ms — bigint merge clock, NOT a timestamp
          0, // deleted=0 so the row passes PantryScreen's `WHERE deleted = 0`
        ],
      );
      navigation.goBack();
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {loc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Expires (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={tokens.color.inkMuted}
              value={expiresAt}
              onChangeText={setExpiresAt}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.submit, (!formValid || submitting) && styles.submitDisabled]}
              onPress={onSubmit}
              disabled={!formValid || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.color.surface} />
              ) : (
                <Text style={styles.submitText}>Add item</Text>
              )}
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
  segmented: {
    flexDirection: 'row',
    marginBottom: tokens.space(4),
    gap: tokens.space(2),
  },
  segment: {
    flex: 1,
    paddingVertical: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: tokens.color.success,
  },
  segmentText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.inkMuted,
  },
  segmentTextSelected: {
    color: tokens.color.surface,
  },
  error: {
    marginBottom: tokens.space(3),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.accent,
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
});
