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
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import * as Haptics from 'expo-haptics';
import { BookOpen, CalendarCheck, Clock, Flame, LayoutGrid, Lightbulb, Store, Users } from 'lucide-react-native';

import { suggestDateRepairs, tipOfTheDay } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BRAND } from '../../theme/brand';
import { Body, Button, Caption, Input, ListRow, Screen } from '../../components/ui';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useDisplayName } from '../household/useDisplayName';
import { useInsights } from '../insights/useInsights';
import { getNotifyHour, setNotifyHour, NOTIFY_HOUR_OPTIONS } from '../expiry/notificationPrefs';
import { feedback } from '../../feedback/feedback';
import {
  type FeedbackPrefs,
  getFeedbackPrefs,
  hydrateFeedbackPrefs,
  setFeedbackPref,
} from '../../feedback/feedbackPrefs';
import { usePantryItems } from '../pantry/usePantryItems';
import type { TabParamList } from '../../navigation/MainTabs';
import type { RootStackParamList } from '../../../App';

/**
 * "Which build are you on?" — the first question of every TestFlight bug
 * report, answered from the screen itself. Version from the JS config,
 * runtime = native-binary fingerprint (which full build), update = OTA
 * identity (null when running the embedded bundle).
 */
function buildLine(): string {
  const version = Constants.expoConfig?.version ?? '?';
  const runtime = typeof Updates.runtimeVersion === 'string' ? Updates.runtimeVersion.slice(0, 8) : '?';
  const update = Updates.updateId ? Updates.updateId.slice(0, 8) : 'embedded';
  return `${BRAND.productName} ${version} · runtime ${runtime} · update ${update}`;
}

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
  const { items } = usePantryItems();
  const [signingOut, setSigningOut] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  // Reminder-time preference (device-local; see notificationPrefs).
  const [notifyHour, setNotifyHourState] = useState<number | null>(null);
  // Sound/haptic toggles (device-local; see feedbackPrefs).
  const [fbPrefs, setFbPrefs] = useState<FeedbackPrefs>(getFeedbackPrefs());

  // Badge for the date-repair row: how many items today's inference would
  // correct (see ReviewDatesScreen). Zero once the user has applied repairs.
  const repairCount = useMemo(
    () =>
      suggestDateRepairs(
        items.map((i) => ({
          id: i.id,
          name: i.name,
          location: i.location,
          addedAt: i.addedAt,
          expiresAt: i.expiresAt,
        })),
      ).length,
    [items],
  );

  // Same deterministic pick as the Tips screen's featured card.
  const dailyTip = useMemo(() => tipOfTheDay(new Date().toISOString()), []);

  // Seed the field once the synced name loads (the reactive query may resolve
  // after first render); editing thereafter is local until blur/submit saves.
  useEffect(() => {
    setNameDraft(myName ?? '');
  }, [myName]);

  useEffect(() => {
    getNotifyHour().then(setNotifyHourState);
    void hydrateFeedbackPrefs().then(setFbPrefs);
  }, []);

  function onToggleFeedback(key: keyof FeedbackPrefs) {
    const next = !fbPrefs[key];
    setFbPrefs((p) => ({ ...p, [key]: next }));
    void setFeedbackPref(key, next);
    if (next) feedback.tick(); // audible/tactile confirmation of turning it ON
  }

  function onPickHour(hour: number) {
    Haptics.selectionAsync().catch(() => {});
    setNotifyHourState(hour);
    // The notification reconciler reads this on its next run (any pantry
    // change or app foreground), so the new hour applies from then on.
    void setNotifyHour(hour);
  }

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

          <View style={styles.section}>
            <Caption>Reminder time</Caption>
            <View style={styles.hourChips}>
              {NOTIFY_HOUR_OPTIONS.map((opt) => {
                const selected = notifyHour === opt.hour;
                return (
                  <Pressable
                    key={opt.hour}
                    onPress={() => onPickHour(opt.hour)}
                    style={[styles.hourChip, selected && styles.hourChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Remind me at ${opt.label}`}
                  >
                    <Text style={[styles.hourChipTxt, selected && styles.hourChipTxtOn]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Body tone="muted" size={12}>
              One calm daily digest, only when something needs using.
            </Body>
          </View>

          <View style={styles.section}>
            <Caption>Feedback</Caption>
            <View style={styles.hourChips}>
              {(
                [
                  { key: 'sounds', label: 'Sounds' },
                  { key: 'haptics', label: 'Haptics' },
                ] as const
              ).map((opt) => {
                const on = fbPrefs[opt.key];
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => onToggleFeedback(opt.key)}
                    style={[styles.hourChip, on && styles.hourChipOn]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${opt.label} ${on ? 'on' : 'off'}`}
                  >
                    <Text style={[styles.hourChipTxt, on && styles.hourChipTxtOn]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Body tone="muted" size={12}>
              Gentle taps and chimes as you cook and check things off. Sounds never interrupt your
              music.
            </Body>
          </View>

          <View style={styles.section}>
            <Caption>Explore</Caption>
            <View style={styles.rowGroup}>
              <ListRow
                icon={<Flame size={16} color={tokens.color.inkMuted} />}
                label="Your impact"
                value={insights.streakDays > 0 ? `🔥 ${insights.streakDays}d` : undefined}
                onPress={() => navigation.navigate('Insights')}
              />
              <ListRow
                icon={<LayoutGrid size={16} color={tokens.color.inkMuted} />}
                label="Collections"
                onPress={() => navigation.navigate('Collections')}
              />
              <ListRow
                icon={<BookOpen size={16} color={tokens.color.inkMuted} />}
                label="Cookbook"
                onPress={() => navigation.navigate('Cookbook')}
              />
              <ListRow
                icon={<Clock size={16} color={tokens.color.inkMuted} />}
                label="History"
                onPress={() => navigation.navigate('History')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Caption>Manage</Caption>
            <View style={styles.rowGroup}>
              <ListRow
                icon={<Store size={16} color={tokens.color.inkMuted} />}
                label="Your stores"
                onPress={() => navigation.navigate('FavoriteStores')}
              />
              <ListRow
                icon={<CalendarCheck size={16} color={tokens.color.inkMuted} />}
                label="Review expiry dates"
                value={repairCount > 0 ? `${repairCount} to fix` : undefined}
                onPress={() => navigation.navigate('ReviewDates')}
              />
              <ListRow
                icon={<Users size={16} color={tokens.color.inkMuted} />}
                label="Household"
                onPress={() => navigation.navigate('Household')}
              />
            </View>
          </View>

          {/* Tip of the day teaser — same deterministic pick as the Tips screen. */}
          <Pressable
            onPress={() => navigation.navigate('Tips')}
            style={({ pressed }) => [styles.tipTeaser, pressed && styles.tipTeaserPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Tip of the day: ${dailyTip.body}`}
          >
            <View style={styles.tipTeaserIcon}>
              <Lightbulb size={16} color={tokens.color.accent} />
            </View>
            <View style={styles.tipTeaserBody}>
              <Text style={styles.tipTeaserCaption}>Tip of the day</Text>
              <Text style={styles.tipTeaserText} numberOfLines={1} ellipsizeMode="tail">
                {dailyTip.body}
              </Text>
            </View>
            <Text style={styles.tipTeaserChevron}>›</Text>
          </Pressable>
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

          <Text style={styles.buildLine} accessibilityLabel={`App version: ${buildLine()}`}>
            {buildLine()}
          </Text>
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
  rowGroup: { gap: tokens.space(2), marginTop: tokens.space(1) },
  tipTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
  },
  tipTeaserPressed: { opacity: 0.7 },
  tipTeaserIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTeaserBody: { flex: 1, gap: 2 },
  tipTeaserCaption: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.accent,
  },
  tipTeaserText: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.ink },
  tipTeaserChevron: { fontFamily: tokens.font.body.regular, fontSize: 22, color: tokens.color.inkMuted },
  deleteRow: {
    alignItems: 'center',
    paddingVertical: tokens.space(3),
  },
  deleteText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.semantic.expiry.expired,
  },
  hourChips: { flexDirection: 'row', gap: tokens.space(2), marginVertical: tokens.space(1) },
  hourChip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  hourChipOn: { backgroundColor: tokens.color.accent },
  // Explicit lineHeight: Nunito Sans clips vertically on iOS without headroom
  // (same fix as the pantry zone chips).
  hourChipTxt: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    lineHeight: 22,
    paddingVertical: 2,
    color: tokens.color.ink,
  },
  hourChipTxtOn: { color: tokens.color.onAccent },
  buildLine: {
    fontFamily: tokens.font.body.regular,
    fontSize: 11,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
