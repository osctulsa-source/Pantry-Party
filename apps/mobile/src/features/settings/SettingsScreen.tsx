/**
 * SettingsScreen — migrated onto the UI primitives (Screen/Caption/Body/ListRow/Button).
 *
 * Sign-out routing is implicit: signOut() flips Supabase auth state, the
 * AuthContext onAuthStateChange listener disconnects PowerSync + clears local
 * SQLite, and App.tsx's auth conditional swaps AppStack → AuthStack. No manual
 * navigation from this screen.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tokens } from '../../theme/tokens';
import { Body, Button, Caption, ListRow, Screen } from '../../components/ui';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../../../App';

type SettingsNav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export function SettingsScreen() {
  const navigation = useNavigation<SettingsNav>();
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const email = state.status === 'authenticated' ? state.session.user.email ?? '—' : '—';

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    // No setSigningOut(false): the auth state flip unmounts this screen.
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.topGroup}>
          <View style={styles.section}>
            <Caption>Account</Caption>
            <Body size={16}>{email}</Body>
          </View>

          <ListRow label="Household" onPress={() => navigation.navigate('Household')} />
        </View>

        <Button title="Sign out" onPress={onSignOut} loading={signingOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(6),
    paddingBottom: tokens.space(6),
  },
  topGroup: {
    gap: tokens.space(6),
  },
  section: {
    gap: tokens.space(1),
  },
});
