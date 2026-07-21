/**
 * DeleteAccountScreen — the irreversible confirmation flow.
 *
 * Pushed from Settings (root-stack, full-screen over tabs). Explains what
 * happens, requires typing "DELETE" to unlock the button (App Store standard),
 * then calls the api's DELETE /account endpoint. On success: clears on-device
 * event logs (best-effort) and signs out — the auth state flip unmounts
 * AppStack, landing the user on the sign-in screen with their data gone.
 *
 * Error handling: network/server failures show an inline error and let the
 * user retry — the endpoint is idempotent, so retrying is always safe.
 */
import { useState } from 'react';
import {
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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { tokens } from '../../theme/tokens';
import { BrandLoader } from '../../components/BrandDecor';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { supabase } from '../../data/supabase/client';
import { capturePostHog } from '../../observability/posthog';

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountScreen() {
  const { state: authState, signOut } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();

  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation.trim().toUpperCase() === CONFIRM_WORD;
  const canDelete = confirmed && !deleting;

  async function onDelete() {
    if (!canDelete) return;
    if (authState.status !== 'authenticated') {
      setError('You must be signed in to delete your account.');
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) throw new Error('API not configured.');

      const token = authState.session.access_token;
      const res = await fetch(`${apiUrl}/account`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = (body as { error?: string } | null)?.error ?? `Server error (${res.status})`;
        throw new Error(msg);
      }

      // Best-effort: clear on-device event logs so they don't linger after
      // the account is gone. Failures here don't block sign-out.
      if (activeHouseholdId) {
        const keys = [
          `expiryEvents:${activeHouseholdId}`,
          `cookLog:${activeHouseholdId}`,
          `scanLog:${activeHouseholdId}`,
          `quickAddConfig:${authState.session.user.id}`,
          `onboarded:${authState.session.user.id}`,
        ];
        await AsyncStorage.multiRemove(keys).catch(() => {});
      }

      capturePostHog('account_deleted');
      // Sign out — the auth state flip unmounts everything.
      await signOut();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Delete your account</Text>

          <View style={styles.explainer}>
            <Text style={styles.body}>This will permanently:</Text>
            <Text style={styles.bullet}>
              {'•'} Remove all your pantry items and shopping list entries
            </Text>
            <Text style={styles.bullet}>
              {'•'} Revoke any invite codes you created
            </Text>
            <Text style={styles.bullet}>
              {'•'} Transfer household ownership to another member (if one exists)
            </Text>
            <Text style={styles.bullet}>
              {'•'} Delete your sign-in credentials
            </Text>
            <Text style={[styles.body, styles.warning]}>
              This action cannot be undone.
            </Text>
          </View>

          <Text style={styles.label}>
            Type <Text style={styles.labelBold}>DELETE</Text> to confirm
          </Text>
          <TextInput
            style={styles.input}
            placeholder="DELETE"
            placeholderTextColor={tokens.color.inkMuted}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.deleteBtn, !canDelete && styles.deleteBtnDisabled]}
            onPress={onDelete}
            disabled={!canDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete my account permanently"
          >
            {deleting ? (
              <BrandLoader variant="dots" size={22} />
            ) : (
              <Text style={styles.deleteBtnText}>Delete my account</Text>
            )}
          </Pressable>

          <Text style={styles.reassurance}>
            Not sure? Just go back — nothing happens until you confirm.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  flex: { flex: 1 },
  scroll: {
    padding: tokens.space(6),
    paddingBottom: tokens.space(10),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 24,
    color: tokens.semantic.expiry.expired,
    letterSpacing: -0.3,
    marginBottom: tokens.space(5),
  },
  explainer: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    marginBottom: tokens.space(6),
    gap: tokens.space(2),
  },
  body: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
  },
  bullet: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
    paddingLeft: tokens.space(3),
  },
  warning: {
    color: tokens.semantic.expiry.expired,
    fontFamily: tokens.font.body.semibold,
    marginTop: tokens.space(2),
  },
  label: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  labelBold: {
    fontFamily: tokens.font.body.semibold,
    color: tokens.color.ink,
  },
  input: {
    marginBottom: tokens.space(4),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.mono,
    fontSize: 18,
    letterSpacing: 3,
    color: tokens.color.ink,
    textAlign: 'center',
  },
  error: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
    textAlign: 'center',
    marginBottom: tokens.space(3),
  },
  deleteBtn: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.semantic.expiry.expired,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  reassurance: {
    marginTop: tokens.space(5),
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
