/**
 * OnboardingScreen — first-run "stock your pantry" step.
 *
 * Rendered directly by AppRoot (gated by useOnboarding) — not part of the main
 * navigator. Reuses QuickAddStaples so tapping a staple inserts it with smart
 * category / location / expiry defaults. "Continue" (or "Skip for now") calls
 * onDone(), which persists the onboarded flag and swaps in the main app.
 *
 * Note: adding a staple needs an active household. On a brand-new sign-up the
 * household is created asynchronously (ensureDefaultHousehold, after first sync),
 * so activeHouseholdId can be null for the first moment on this screen — we show
 * a brief "getting your pantry ready" hint until it resolves so an early tap
 * isn't silently ignored. (The reactive ActiveHouseholdContext fills it in
 * without a relaunch.)
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { suggestExpiryISO } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BRAND } from '../../theme/brand';
import { OnboardingHeroArt } from '../../components/illustrations/OnboardingHeroArt';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from '../pantry/addPantryItem';
import { QuickAddStaples } from '../pantry/QuickAddStaples';
import type { Staple } from '../pantry/staples';

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const [added, setAdded] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);

  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  const householdReady = userId !== null && activeHouseholdId !== null;

  async function onAdd(staple: Staple) {
    if (!userId || !activeHouseholdId || added.includes(staple.name)) return;
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: staple.name,
        quantity: 1,
        location: staple.location,
        expiresIso: staple.noExpiry
          ? null
          : suggestExpiryISO({ name: staple.name, category: staple.category, location: staple.location }),
        source: 'manual',
      });
      setAdded((prev) => [...prev, staple.name]);
    } catch {
      // Swallow during onboarding — a single failed staple shouldn't block setup.
    }
  }

  function finish() {
    if (finishing) return;
    setFinishing(true);
    onDone();
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <OnboardingHeroArt />
        <Text style={styles.eyebrow}>Welcome to {BRAND.productName}</Text>
        <Text style={styles.title}>Let's stock your pantry</Text>
        <Text style={styles.hint}>
          Tap the staples you usually keep on hand — we'll add them with smart expiry dates. You can skip this and add
          things anytime.
        </Text>
        {!householdReady && <Text style={styles.settingUp}>Getting your pantry ready…</Text>}
        <View style={styles.list}>
          <QuickAddStaples added={added} onAdd={onAdd} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={finish} disabled={finishing}>
          <Text style={styles.ctaText}>
            {added.length > 0 ? `Added ${added.length} — continue` : 'Continue'}
          </Text>
        </Pressable>
        {added.length === 0 && (
          <Pressable style={styles.skip} onPress={finish} disabled={finishing}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(6) },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(2),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: -0.5,
    marginBottom: tokens.space(2),
  },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(5),
  },
  settingUp: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(3),
  },
  list: { marginTop: tokens.space(1) },
  footer: {
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  cta: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  ctaText: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
  skip: { marginTop: tokens.space(2), paddingVertical: tokens.space(2), alignItems: 'center' },
  skipText: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
});
