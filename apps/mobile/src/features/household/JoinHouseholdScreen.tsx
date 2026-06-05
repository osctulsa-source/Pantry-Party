/**
 * JoinHouseholdScreen — paste an invite code, join the household.
 *
 * State machine: idle → submitting → (success → navigate back) | (error → display)
 *
 * Error copy is keyed off the HTTP status surfaced via err.status on the
 * AcceptInviteError thrown by householdClient.acceptInvite:
 *   400 → "Invalid code format..."
 *   404 → "Code not found..."
 *   409 → either "already used" or "already a member" — distinguished by the
 *         error body (the backend returns both with status 409, see
 *         services/api/src/routes/household.ts).
 *   410 → "This code expired..."
 *   network → "Couldn't connect. Try again."
 *
 * On success: setActiveHouseholdId(response.household_id) — the user just
 * chose to join this household, so it becomes the active one (matches the
 * "least surprise" expectation from locked decision #3) — then navigation.goBack().
 *
 * Layout mirrors SignInScreen / InviteCodeModal: centered card on the surface
 * background, full-width accent submit button.
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

import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from './ActiveHouseholdContext';
import { acceptInvite, type AcceptInviteError } from '../../data/api/householdClient';
import type { RootStackParamList } from '../../../App';

type JoinHouseholdNav = NativeStackNavigationProp<RootStackParamList, 'JoinHousehold'>;

// WORD-XXXX is 4-12 chars depending on word length; cap at 12 to match the
// generator's longest possible output.
const MAX_CODE_LENGTH = 12;

function messageForError(err: unknown): string {
  if (err && typeof err === 'object' && 'status' in err) {
    const apiErr = err as AcceptInviteError;
    switch (apiErr.status) {
      case 400:
        return 'Invalid code format. Codes look like BREAD-7K2M.';
      case 404:
        return 'Code not found. Check the code and try again.';
      case 410:
        return 'This code expired. Ask for a new one.';
      case 409:
        // Backend returns both "already used" and "already a member" as 409 —
        // disambiguate via the message body. acceptInvite stuffs the response
        // text into the Error's message.
        if (apiErr.message.includes('already a member')) {
          return "You're already a member of this household.";
        }
        return 'This code was already used. Ask for a new one.';
      default:
        return 'Something went wrong. Try again.';
    }
  }
  // Network failures (TypeError: Network request failed) and other unknowns.
  return "Couldn't connect. Try again.";
}

export function JoinHouseholdScreen() {
  const navigation = useNavigation<JoinHouseholdNav>();
  const { state: authState } = useAuth();
  const { setActiveHouseholdId } = useActiveHousehold();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedCode = code.trim();
  const canSubmit = trimmedCode.length > 0 && !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    if (authState.status !== 'authenticated') {
      setError('You must be signed in to join a household.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await acceptInvite(trimmedCode, authState.session.access_token);
      // Set the newly-joined household as active before navigating away — the
      // user explicitly chose this one, so it should be what they see next.
      setActiveHouseholdId(response.household_id);
      navigation.goBack();
    } catch (e: unknown) {
      setError(messageForError(e));
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
            <Text style={styles.title}>Join a household</Text>
            <Text style={styles.subtitle}>Enter the code someone shared with you.</Text>

            <TextInput
              style={styles.input}
              placeholder="BREAD-7K2M"
              placeholderTextColor={tokens.color.inkMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={MAX_CODE_LENGTH}
              autoFocus
            />

            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.color.surface} />
              ) : (
                <Text style={styles.submitText}>Join</Text>
              )}
            </Pressable>

            {error && <Text style={styles.error}>{error}</Text>}
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
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 32,
    color: tokens.color.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: tokens.space(2),
    marginBottom: tokens.space(6),
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
  },
  input: {
    marginBottom: tokens.space(4),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.mono,
    fontSize: 18,
    letterSpacing: 2,
    color: tokens.color.ink,
  },
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
    color: tokens.color.surface,
  },
  error: {
    marginTop: tokens.space(4),
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.accent,
    textAlign: 'center',
  },
});
