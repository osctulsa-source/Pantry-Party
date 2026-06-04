/**
 * SettingsScreen — minimal v1.
 *
 * Two sections only: the signed-in account email and a sign-out action.
 * Shared Household, notification preferences, and account deletion are future
 * PRs and intentionally absent here.
 *
 * Sign-out routing is implicit: signOut() flips Supabase auth state, the
 * AuthContext onAuthStateChange listener disconnects PowerSync + clears local
 * SQLite, and App.tsx's auth conditional swaps AppStack → AuthStack. No manual
 * navigation from this screen.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';

export function SettingsScreen() {
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const email = state.status === 'authenticated' ? state.session.user.email ?? '—' : '—';

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    // No setSigningOut(false): the auth state flip unmounts this screen.
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Account</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <Pressable
          style={[styles.signOut, signingOut && styles.signOutDisabled]}
          onPress={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color={tokens.color.surface} />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(6),
    paddingBottom: tokens.space(6),
  },
  section: {
    gap: tokens.space(1),
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
  },
  email: {
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  signOut: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  signOutDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.surface,
  },
});
