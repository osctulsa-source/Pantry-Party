/**
 * InviteCodeModal — presented modally on top of HouseholdScreen.
 *
 * Behavior: the request fires on mount. The user shouldn't perceive
 * code-generation as a separate intentional step; tapping "Invite member" on
 * the previous screen is the trigger, and this modal is the result. We show a
 * spinner while the fetch is in flight, then swap to the code on success or an
 * inline error + retry on failure.
 *
 * State machine:
 *   loading  → spinner + "Generating code..."
 *   success  → code + expiry note + Share + Copy + Done
 *   error    → message + Retry
 *
 * Sharing: the primary action is the native share sheet (Share.share) with a
 * message carrying both the plain code and the pantryparty:// deep link —
 * one tap from "generated" to "in my roommate's Messages". Copy remains as
 * the fallback for channels the share sheet doesn't cover.
 *
 * Auth: the access token is pulled from the live Supabase session via
 * useAuth(); the household id is a route param.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { generateInvite, type InviteResponse } from '../../data/api/householdClient';
import { buildInviteShareMessage } from './inviteLink';
import type { RootStackParamList } from '../../../App';

type InviteCodeModalNav = NativeStackNavigationProp<RootStackParamList, 'InviteCodeModal'>;
type InviteCodeModalRoute = RouteProp<RootStackParamList, 'InviteCodeModal'>;

type InviteState =
  | { status: 'loading' }
  | { status: 'success'; data: InviteResponse }
  | { status: 'error'; message: string };

export function InviteCodeModal() {
  const navigation = useNavigation<InviteCodeModalNav>();
  const route = useRoute<InviteCodeModalRoute>();
  const { householdId } = route.params;
  const { state: authState } = useAuth();

  const [inviteState, setInviteState] = useState<InviteState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);

  const fetchInvite = useCallback(async () => {
    if (authState.status !== 'authenticated') {
      setInviteState({
        status: 'error',
        message: 'You must be signed in to generate an invite.',
      });
      return;
    }
    setInviteState({ status: 'loading' });
    try {
      const data = await generateInvite(householdId, authState.session.access_token);
      setInviteState({ status: 'success', data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setInviteState({ status: 'error', message });
    }
  }, [authState, householdId]);

  useEffect(() => {
    void fetchInvite();
  }, [fetchInvite]);

  async function onShare(code: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({ message: buildInviteShareMessage(code) });
    } catch {
      // Share sheet dismissed or unavailable — nothing to clean up; the
      // code is still on screen with Copy as the fallback.
    }
  }

  async function onCopy(code: string) {
    await Clipboard.setStringAsync(code);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Invite a member</Text>
          {inviteState.status === 'loading' && (
            <View style={styles.statusBlock}>
              <ActivityIndicator color={tokens.color.accent} />
              <Text style={styles.caption}>Generating code...</Text>
            </View>
          )}

          {inviteState.status === 'success' && (
            <>
              <Text style={styles.code} accessibilityLabel={`Invite code ${inviteState.data.invite_code}`}>
                {inviteState.data.invite_code}
              </Text>
              <Text style={styles.subtitle}>Expires in 24 hours</Text>

              <Pressable
                style={styles.primaryButton}
                accessibilityRole="button"
                accessibilityLabel="Share invite"
                onPress={() => onShare(inviteState.data.invite_code)}
              >
                <Text style={styles.primaryButtonText}>Share invite</Text>
              </Pressable>

              <Pressable
                style={styles.outlineButton}
                accessibilityRole="button"
                accessibilityLabel="Copy invite code"
                onPress={() => onCopy(inviteState.data.invite_code)}
              >
                <Text style={styles.outlineButtonText}>
                  {copied ? 'Copied!' : 'Copy code'}
                </Text>
              </Pressable>

              <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
                <Text style={styles.secondaryButtonText}>Done</Text>
              </Pressable>
            </>
          )}

          {inviteState.status === 'error' && (
            <>
              <View style={styles.statusBlock}>
                <Text style={styles.errorText}>{inviteState.message}</Text>
              </View>
              <Pressable style={styles.primaryButton} onPress={fetchInvite}>
                <Text style={styles.primaryButtonText}>Retry</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.space(6),
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingVertical: tokens.space(4),
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(4),
  },
  statusBlock: {
    alignItems: 'center',
    paddingVertical: tokens.space(8),
    gap: tokens.space(3),
  },
  caption: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
  },
  code: {
    fontFamily: tokens.font.mono,
    fontSize: 36,
    letterSpacing: 4,
    textAlign: 'center',
    color: tokens.color.ink,
    paddingVertical: tokens.space(4),
  },
  subtitle: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    marginBottom: tokens.space(6),
  },
  primaryButton: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    marginBottom: tokens.space(3),
  },
  primaryButtonText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.surface,
  },
  outlineButton: {
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: tokens.color.line,
    marginBottom: tokens.space(3),
  },
  outlineButtonText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 15,
    color: tokens.color.accent,
  },
  secondaryButton: {
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 15,
    color: tokens.color.inkMuted,
  },
  errorText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.accent,
    textAlign: 'center',
  },
});
