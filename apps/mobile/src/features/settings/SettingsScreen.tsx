/**
 * SettingsScreen — migrated onto the UI primitives (Screen/Heading/Caption/Body/ListRow/Button).
 *
 * As of Phase 2 this is a persistent TAB (see navigation/MainTabs), so it
 * self-heads: Screen's default edges include 'top' and a Heading replaces the
 * old native-stack header title. Household still pushes on the root stack.
 *
 * Sign-out routing is implicit: signOut() flips Supabase auth state, the
 * AuthContext onAuthStateChange listener disconnects PowerSync + clears local
 * SQLite, and App.tsx's auth conditional swaps AppStack → AuthStack. No manual
 * navigation from this screen.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { tokens } from '../../theme/tokens';
import { Body, Button, Caption, Heading, Input, ListRow, Screen } from '../../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useDisplayName } from '../household/useDisplayName';
import { useInsights } from '../insights/useInsights';
import type { TabParamList } from '../../navigation/MainTabs';
import type { RootStackParamList } from '../../../App';

type SettingsNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'SettingsTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function SettingsScreen() {
  const navigation = useNavigation<SettingsNav>();
  const { state, signOut } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const { insights } = useInsights(activeHouseholdId);
  const { myName, setMyName } = useDisplayName();
  const [signingOut, setSigningOut] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Seed the field once the synced name loads (the reactive query may resolve
  // after first render); editing thereafter is local until blur/submit saves.
  useEffect(() => {
    setNameDraft(myName ?? '');
  }, [myName]);

  const email = state.status === 'authenticated' ? state.session.user.email ?? '—' : '—';

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    // No setSigningOut(false): the auth state flip unmounts this screen.
  }

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.topGroup}>
          <Heading size="xl">Settings</Heading>

          <View style={styles.section}>
            <Caption>Your name</Caption>
            <Input
              value={nameDraft}
              onChangeText={setNameDraft}
              onEndEditing={() => void setMyName(nameDraft)}
              placeholder="Add your name"
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={40}
            />
            <Body tone="muted" size={12}>
              Shown to your household on shared items and history.
            </Body>
          </View>

          <View style={styles.section}>
            <Caption>Account</Caption>
            <Body size={16}>{email}</Body>
          </View>

          <ListRow
            label="Your impact"
            value={insights.streakDays > 0 ? `🔥 ${insights.streakDays}d` : undefined}
            onPress={() => navigation.navigate('Insights')}
          />
          <ListRow label="History" onPress={() => navigation.navigate('History')} />
          <ListRow label="Household" onPress={() => navigation.navigate('Household')} />
        </View>

        <View style={styles.bottomGroup}>
          <Button title="Sign out" onPress={onSignOut} loading={signingOut} />

          <Pressable
            onPress={() => navigation.navigate('DeleteAccount')}
            style={styles.deleteRow}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Text style={styles.deleteText}>Delete my account</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(6),
  },
  topGroup: {
    gap: tokens.space(6),
  },
  section: {
    gap: tokens.space(1),
  },
  bottomGroup: {
    gap: tokens.space(4),
  },
  deleteRow: {
    alignItems: 'center',
    paddingVertical: tokens.space(3),
  },
  deleteText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.semantic.expiry.expired,
  },
});
