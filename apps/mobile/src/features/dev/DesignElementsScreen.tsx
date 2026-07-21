/**
 * DesignElementsScreen — a dev-only showcase for the App Elements kit
 * (notification badge/banner, achievement badges, settings rows/tiles).
 *
 * Reached from Settings → Developer (rendered only under __DEV__). It exists to
 * preview the components in the real app runtime — light/dark, live animation,
 * real glyphs — before they're wired into production screens. It touches no app
 * data, so it's safe to open anytime.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Body, Caption, Button, Screen } from '../../components/ui';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  AppIconBadge,
  BadgeGrid,
  BannerNotification,
  ProgressRingBadge,
  SettingsList,
  SettingsTiles,
  type Badge,
  type SettingsItem,
} from '../../components/elements';
import { tokens } from '../../theme/tokens';

const BADGES: Badge[] = [
  { food: 'flame', tone: 'terracotta', earned: true, label: '7-day streak' },
  { food: 'bread', tone: 'ochre', earned: true, label: 'First bake' },
  { food: 'pepper', tone: 'fern', earned: true, label: 'Zero waste week' },
  { food: 'fish', tone: 'spruce', earned: false, label: 'Sea to table' },
  { food: 'grapes', tone: 'plum', earned: false, label: 'Preserver' },
  { food: 'egg', tone: 'blue', earned: false, label: 'Breakfast club' },
];

const SETTINGS: SettingsItem[] = [
  { food: 'bread', label: 'Your name', onPress: () => {} },
  { food: 'flame', label: 'Reminders', onPress: () => {} },
  { food: 'herb', label: 'Household', onPress: () => {} },
  { food: 'lemon', label: 'Feedback', onPress: () => {} },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Caption>{title}</Caption>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function DesignElementsScreen() {
  const [count, setCount] = useState(3);
  const [progress, setProgress] = useState(0.35);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScreenHeader title="Design elements" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Body tone="muted" size={13}>
          Dev-only preview of the App Elements kit. Toggle the OS theme and Reduce Motion to check
          both. Not wired into production screens yet.
        </Body>

        <Section title="Notification · app icon (1a)">
          <View style={styles.row}>
            <AppIconBadge count={count} />
            <View style={styles.stepper}>
              <Button title="–" variant="secondary" onPress={() => setCount((c) => Math.max(0, c - 1))} style={styles.stepBtn} />
              <Button title="+" variant="secondary" onPress={() => setCount((c) => c + 1)} style={styles.stepBtn} />
            </View>
          </View>
        </Section>

        <Section title="Notification · banner (1b)">
          <BannerNotification
            food="tomato"
            title="3 items expiring soon"
            body="Tomatoes, spinach and bread — tap to cook something."
          />
        </Section>

        <Section title="Achievements · badge grid (1i)">
          <BadgeGrid badges={BADGES} />
        </Section>

        <Section title="Achievements · progress ring (1j)">
          <View style={styles.row}>
            <ProgressRingBadge progress={progress} label="Streak progress" />
            <View style={styles.stepper}>
              <Button title="–" variant="secondary" onPress={() => setProgress((p) => Math.max(0, p - 0.15))} style={styles.stepBtn} />
              <Button title="+" variant="secondary" onPress={() => setProgress((p) => Math.min(1, p + 0.15))} style={styles.stepBtn} />
            </View>
          </View>
        </Section>

        <Section title="Settings · list rows (1k)">
          <SettingsList items={SETTINGS} />
        </Section>

        <Section title="Settings · icon tiles (1l)">
          <SettingsTiles items={SETTINGS} />
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(2),
    paddingBottom: tokens.space(10),
    gap: tokens.space(6),
  },
  section: { gap: tokens.space(2) },
  sectionBody: { marginTop: tokens.space(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(5) },
  stepper: { flexDirection: 'row', gap: tokens.space(2) },
  stepBtn: { height: 40, width: 48, paddingHorizontal: 0 },
});
