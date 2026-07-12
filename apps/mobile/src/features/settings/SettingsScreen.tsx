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
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { tokens } from '../../theme/tokens';
import { Body, Button, Caption, Input, ListRow, Screen } from '../../components/ui';
import { ScreenHeader } from '../../components/ScreenHeader';
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
      <ScreenHeader title="Settings" />
      {/* Scrolls when the row list outgrows the screen (it does on smaller
          phones since Collections/Cookbook landed); on tall screens flexGrow
          keeps sign-out pinned to the bottom exactly as before. */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topGroup}>
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
          <ListRow label="Collections" onPress={() => navigation.navigate('Collections')} />
          <ListRow label="Cookbook" onPress={() => navigation.navigate('Cookbook')} />
          <ListRow label="History" onPress={() => navigation.navigate('History')} />
          <ListRow label="Your stores" onPress={() => navigation.navigate('FavoriteStores')} />
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // contentContainerStyle: flexGrow (not flex) so short content still fills
  // the screen (sign-out pinned to the bottom) while long content scrolls.
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(2),
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
    // Breathing room when the list is long enough to sit directly above it.
    paddingTop: tokens.space(6),
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
