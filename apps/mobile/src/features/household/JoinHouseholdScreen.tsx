/**
 * JoinHouseholdScreen — paste an invite code, join the household.
 *
 * State machine: idle → submitting → (success → navigate back) | (error → display)
 *
 * Deep links: the route accepts an optional `code` param
 * (pantryparty://invite/BREAD-7K2M → JoinHousehold with code pre-filled, see
 * App.tsx linking config). The param seeds the input but the user still taps
 * Join — auto-submitting on open would make a mistyped or stale link fire a
 * request with no chance to review.
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
 * background, full-width accent submit button. Phase 3 sweep: error text uses
 * the semantic expired red (it was tokens.color.accent — RED in the oxblood
 * era, but brand GREEN since the Crumb re-skin) and on-accent text uses
 * color.onAccent rather than color.surface.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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

import { tokens } from '../../theme/tokens';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from './ActiveHouseholdContext';
import { acceptInvite, type AcceptInviteError } from '../../data/api/householdClient';
import type { RootStackParamList } from '../../../App';

type JoinHouseholdNav = NativeStackNavigationProp<RootStackParamList, 'JoinHousehold'>;
type JoinHouseholdRoute = RouteProp<RootStackParamList, 'JoinHousehold'>;

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

/** Deep-link params arrive URL-encoded and possibly lowercased; normalize to
 *  the canonical WORD-XXXX form the input would have produced. */
function normalizeIncomingCode(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().toUpperCase().slice(0, MAX_CODE_LENGTH);
  } catch {
    return raw.trim().toUpperCase().slice(0, MAX_CODE_LENGTH);
  }
}

export function JoinHouseholdScreen() {
  const navigation = useNavigation<JoinHouseholdNav>();
  const route = useRoute<JoinHouseholdRoute>();
  const { state: authState } = useAuth();
  const { setActiveHouseholdId } = useActiveHousehold();

  const [code, setCode] = useState(() => normalizeIncomingCode(route.params?.code));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!joined) return;
    Animated.spring(burst, { toValue: 1, tension: 120, friction: 7, useNativeDriver: true }).start();
  }, [joined, burst]);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setJoined(true);
      setTimeout(() => navigation.goBack(), 1400);
    } catch (e: unknown) {
      setError(messageForError(e));
      setSubmitting(false);
    }
  }

  if (joined) {
    const opacity = burst.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
    const scale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Animated.View style={[styles.joined, { opacity, transform: [{ scale }] }]}>
            <BrandMark size={72} />
            <Text style={styles.joinedTitle}>You're in!</Text>
            <Text style={styles.joinedSub}>Welcome to the household.</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
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
            <Text style={styles.subtitle}>
              {route.params?.code
                ? 'Check the code below, then tap Join.'
                : 'Enter the code someone shared with you.'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="BREAD-7K2M"
              placeholderTextColor={tokens.color.inkMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={MAX_CODE_LENGTH}
              autoFocus={!route.params?.code}
            />

            <Pressable
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.color.onAccent} />
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
  joined: {
    alignItems: 'center',
    paddingHorizontal: tokens.space(6),
  },
  joinedTitle: {
    marginTop: tokens.space(4),
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: -0.5,
  },
  joinedSub: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
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
    color: tokens.color.onAccent,
  },
  error: {
    marginTop: tokens.space(4),
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.semantic.expiry.expired,
    textAlign: 'center',
  },
});
