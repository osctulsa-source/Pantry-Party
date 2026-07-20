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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useTasteProfile } from '../recipes/useTasteProfile';
import { track } from '../../observability/analytics';
import { DietStep, type DietSelection } from './DietStep';

export function OnboardingScreen({ onDone }: { onDone: (result: { seededPantry: boolean }) => void }) {
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const [added, setAdded] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [dietSel, setDietSel] = useState<DietSelection>({ diets: [], allergies: [] });
  const [dietSaved, setDietSaved] = useState(false);
  const { profile, save: saveProfile, loadedFor: profileLoadedFor } = useTasteProfile(activeHouseholdId);

  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  const householdReady = userId !== null && activeHouseholdId !== null;

  useEffect(() => {
    void track('onboarding_started');
  }, []);

  // Persist step-1 answers once the profile for THIS household has actually
  // loaded. Gate on loadedFor === activeHouseholdId (not the bare `loaded`
  // flag): during the first-launch null→resolved household race the profile is
  // briefly a stale EMPTY loaded "for" null, and merging onto that would wipe
  // any existing cuisines/flavors/speed. Runs at most once (dietSaved guard).
  useEffect(() => {
    if (step === 1 || dietSaved || activeHouseholdId === null || profileLoadedFor !== activeHouseholdId) return;
    if (dietSel.diets.length === 0 && dietSel.allergies.length === 0) {
      setDietSaved(true);
      return;
    }
    saveProfile({ ...profile, diets: dietSel.diets, allergies: dietSel.allergies });
    setDietSaved(true);
  }, [step, dietSaved, profileLoadedFor, activeHouseholdId, dietSel, profile, saveProfile]);

  // Staples the user tapped before the household finished resolving. We can't
  // insert them yet (no householdId), but we must NOT drop the tap — on a
  // brand-new sign-up the household is created async, so the first taps land
  // during that race and used to be silent no-ops (empty pantry + tiles that
  // "wouldn't select"). We buffer them and flush once the household resolves.
  const [pendingStaples, setPendingStaples] = useState<Staple[]>([]);
  const insertStaple = useCallback(
    async (staple: Staple, householdId: string) => {
      try {
        await addPantryItem({
          householdId,
          userId: userId as string,
          name: staple.name,
          quantity: 1,
          category: staple.category,
          location: staple.location,
          expiresIso: staple.noExpiry
            ? null
            : suggestExpiryISO({ name: staple.name, category: staple.category, location: staple.location }),
          source: 'manual',
        });
        setAdded((prev) => (prev.includes(staple.name) ? prev : [...prev, staple.name]));
      } catch {
        // Swallow during onboarding — a single failed staple shouldn't block setup.
      }
    },
    [userId],
  );

  function onAdd(staple: Staple) {
    if (!userId || added.includes(staple.name) || pendingStaples.some((s) => s.name === staple.name)) return;
    if (!activeHouseholdId) {
      // Household not ready yet — show the tile as selected immediately (so the
      // tap registers visibly) and queue the real insert for when it resolves.
      setAdded((prev) => [...prev, staple.name]);
      setPendingStaples((prev) => [...prev, staple]);
      return;
    }
    void insertStaple(staple, activeHouseholdId);
  }

  // Flush queued staples the instant the household resolves. `flushing` is state
  // (not a ref) so its false→true→false transitions re-render and re-run the
  // finish effect below; the ref mirror guards against a double-flush within a
  // single async batch.
  const [flushing, setFlushing] = useState(false);
  const flushingRef = useRef(false);
  useEffect(() => {
    if (!activeHouseholdId || pendingStaples.length === 0 || flushingRef.current) return;
    flushingRef.current = true;
    setFlushing(true);
    const batch = pendingStaples;
    setPendingStaples([]);
    void (async () => {
      for (const staple of batch) {
        await insertStaple(staple, activeHouseholdId);
      }
      flushingRef.current = false;
      setFlushing(false);
    })();
  }, [activeHouseholdId, pendingStaples, insertStaple]);

  // Tapping Continue while staples are still queued (household hasn't resolved)
  // must not drop them. Enter a "finishing" state that blocks the buttons; the
  // effect below calls onDone() only once the queue has drained.
  function finish() {
    if (finishing) return;
    setFinishing(true);
  }
  useEffect(() => {
    if (finishing && pendingStaples.length === 0 && !flushing) {
      // count === 0 means the user skipped seeding — a first-class funnel signal.
      void track('staples_seeded', { count: added.length });
      onDone({ seededPantry: added.length > 0 });
    }
  }, [finishing, pendingStaples, flushing, onDone, added.length]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      {step === 1 ? (
        <DietStep
          diets={dietSel.diets}
          allergies={dietSel.allergies}
          onChange={setDietSel}
          onContinue={() => setStep(2)}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <OnboardingHeroArt />
            <Text style={styles.eyebrow}>2 of 2 · Welcome to {BRAND.productName}</Text>
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
                {finishing && pendingStaples.length > 0
                  ? 'Finishing up…'
                  : added.length > 0
                    ? `Added ${added.length} — continue`
                    : 'Continue'}
              </Text>
            </Pressable>
            {added.length === 0 && (
              <Pressable style={styles.skip} onPress={finish} disabled={finishing}>
                <Text style={styles.skipText}>Skip for now</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
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
