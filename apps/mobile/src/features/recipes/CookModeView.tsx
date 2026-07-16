/**
 * CookModeView — hands-free, step-by-step cooking (the "calm cook-along").
 *
 * Launched from the recipe detail screen. Designed to take the stress out of
 * following a recipe:
 *  - mise en place: a "get set up" screen FIRST — the equipment you'll need and
 *    a check-off list of everything to gather, so there's no mid-cook scramble.
 *  - per-step ingredients WITH AMOUNTS: the amounts THIS step needs, inline —
 *    matched from the recipe's full ingredient list ("2 cups flour", not "flour").
 *  - a REAL kitchen timer: tagged duration (or one detected in the text) → a
 *    countdown that survives moving to other steps (a pill brings you back),
 *    is computed from a target time (so backgrounding the app doesn't drift),
 *    fires a local notification when it's up (so you can put the phone down).
 *  - reassurance: a calm, stage-aware line so a nervous cook feels guided.
 *  - check-off: mark each step done; the last one finishes into the "I made
 *    this" pantry decrement.
 *  - keep-awake: the screen stays on while you cook.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { ArrowLeft, Check, Pause, Play, RotateCcw, Timer, X } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import { ensureNotificationPermission } from '../expiry/expoScheduler';
import { TechniqueGlyph } from '../../components/TechniqueGlyph';
import { resolveStepGlyph } from './matchTechnique';

type Phase = 'prep' | 'steps';

interface FlatStep {
  group: string;
  step: string;
  ingredients: string[];
  lengthMinutes: number | null;
  technique: string | null;
}

/**
 * A single in-flight timer. Timestamp-based so backgrounding the app never
 * drifts it: `endsAt` is the wall-clock moment it finishes; remaining is always
 * recomputed from now. Bound to the step it was started on (stepIdx) so it can
 * persist while you move around + a pill can bring you back.
 */
type CookTimer =
  | null
  | { stepIdx: number; status: 'running'; endsAt: number; totalSec: number }
  | { stepIdx: number; status: 'paused'; remainingSec: number; totalSec: number };

// One cook-along timer at a time → one notification id; scheduling again
// replaces it, and we cancel on pause / reset / completion / leaving the screen.
const TIMER_NOTIF_ID = 'cookmode-timer';

async function scheduleTimerNotif(endsAt: number, stepIdx: number): Promise<void> {
  try {
    const ok = await ensureNotificationPermission();
    if (!ok) return;
    await Notifications.scheduleNotificationAsync({
      identifier: TIMER_NOTIF_ID,
      content: { title: 'Timer done', body: `Your step ${stepIdx + 1} timer is up.`, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt) },
    });
  } catch {
    // best-effort — the in-app countdown + haptic still work without it.
  }
}

function cancelTimerNotif(): void {
  Notifications.cancelScheduledNotificationAsync(TIMER_NOTIF_ID).catch(() => {});
}

/** Pull a usable timer duration out of a step's text when it isn't tagged. */
function parseMinutes(text: string): number | null {
  const m = text.match(/(\d+)\s*(hour|hr|minute|min)/i);
  if (!m) return null;
  const n = parseInt(m[1] ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mins = (m[2] ?? '').toLowerCase().startsWith('h') ? n * 60 : n;
  return mins >= 1 && mins <= 240 ? mins : null;
}

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** A calm, stage-aware nudge — guidance for a nervous cook, not cheerleading. */
function encouragement(idx: number, total: number): string {
  if (total <= 1) return "Just one step — you've got this.";
  if (idx === 0) return "One step at a time — you've got this.";
  if (idx >= total - 1) return 'Last step — almost there!';
  return "Take your time. There's no rush.";
}

export function CookModeView({
  recipe,
  onClose,
  onFinish,
}: {
  recipe: SpoonacularRecipe;
  onClose: () => void;
  onFinish: () => void;
}) {
  // Keep the screen on while cooking — released automatically on unmount.
  useKeepAwake();

  const steps = useMemo<FlatStep[]>(() => {
    const flat: FlatStep[] = [];
    for (const group of recipe.instructions) {
      for (const s of group.steps) {
        flat.push({
          group: group.name,
          step: s.step,
          ingredients: s.ingredients ?? [],
          lengthMinutes: s.lengthMinutes ?? null,
          technique: s.technique ?? null,
        });
      }
    }
    return flat;
  }, [recipe.instructions]);

  // Equipment, de-duped across every step — the "you'll need" list for setup.
  const equipment = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const group of recipe.instructions) {
      for (const s of group.steps) {
        for (const e of s.equipment ?? []) {
          const k = e.toLowerCase();
          if (k && !seen.has(k)) {
            seen.add(k);
            out.push(e);
          }
        }
      }
    }
    return out;
  }, [recipe.instructions]);

  // Per-step ingredient names carry no amount; match them to the recipe's full
  // ingredient list so "flour" shows as "2 cups flour" mid-cook. Falls back to
  // the bare name when there's no match (e.g. parsed-fallback recipes).
  const amountFor = useMemo(() => {
    const list = recipe.ingredients;
    return (stepName: string): string => {
      const n = stepName.trim().toLowerCase();
      if (!n) return stepName;
      const exact = list.find((i) => i.name.trim().toLowerCase() === n);
      const loose =
        exact ??
        list.find((i) => {
          const c = i.name.trim().toLowerCase();
          return c.length > 0 && (c.includes(n) || n.includes(c));
        });
      return loose?.original || loose?.name || stepName;
    };
  }, [recipe.ingredients]);

  const [phase, setPhase] = useState<Phase>('prep');
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [gathered, setGathered] = useState<Set<number>>(new Set());
  const [timer, setTimer] = useState<CookTimer>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const total = steps.length;
  const current = steps[idx];
  const isLast = idx >= total - 1;
  const isDone = done.has(idx);
  const mins = current ? current.lengthMinutes ?? parseMinutes(current.step) : null;

  const remaining = timer
    ? timer.status === 'paused'
      ? timer.remainingSec
      : Math.max(0, Math.round((timer.endsAt - nowTs) / 1000))
    : 0;
  const timerOnThisStep = timer !== null && timer.stepIdx === idx;
  const timerElsewhere = timer !== null && timer.stepIdx !== idx;

  // Tick once a second only while a timer is actually running.
  useEffect(() => {
    if (timer?.status !== 'running') return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer?.status]);

  // Zero-cross: when a running timer hits 0, buzz once, drop the OS notification
  // (we're clearly foregrounded), and freeze it at "Time's up".
  useEffect(() => {
    if (timer?.status !== 'running') return;
    if (timer.endsAt - nowTs <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      cancelTimerNotif();
      setTimer({ stepIdx: timer.stepIdx, status: 'paused', remainingSec: 0, totalSec: timer.totalSec });
    }
  }, [timer, nowTs]);

  // Leaving cook mode ends the cook-along — don't let a stray timer notification
  // fire with no context.
  useEffect(() => () => cancelTimerNotif(), []);

  function startCooking() {
    Haptics.selectionAsync().catch(() => {});
    setPhase('steps');
  }
  function toggleGather(i: number) {
    Haptics.selectionAsync().catch(() => {});
    setGathered((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function goBack() {
    Haptics.selectionAsync().catch(() => {});
    if (idx === 0) {
      setPhase('prep'); // Back on step 1 returns to the setup screen.
      return;
    }
    setIdx((i) => Math.max(i - 1, 0));
  }
  function onForward() {
    setDone((prev) => new Set(prev).add(idx));
    if (isLast) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onFinish();
    } else {
      Haptics.selectionAsync().catch(() => {});
      setIdx((i) => Math.min(i + 1, total - 1));
    }
  }

  function startTimer() {
    if (mins === null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const totalSec = mins * 60;
    const endsAt = Date.now() + totalSec * 1000;
    setNowTs(Date.now());
    setTimer({ stepIdx: idx, status: 'running', endsAt, totalSec });
    void scheduleTimerNotif(endsAt, idx);
  }
  function toggleTimer() {
    if (!timer) return;
    if (timer.status === 'running') {
      const rem = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
      cancelTimerNotif();
      setTimer({ stepIdx: timer.stepIdx, status: 'paused', remainingSec: rem, totalSec: timer.totalSec });
    } else {
      const endsAt = Date.now() + timer.remainingSec * 1000;
      setNowTs(Date.now());
      setTimer({ stepIdx: timer.stepIdx, status: 'running', endsAt, totalSec: timer.totalSec });
      void scheduleTimerNotif(endsAt, timer.stepIdx);
    }
  }
  function resetTimer() {
    cancelTimerNotif();
    setTimer(null);
  }

  const metaLine = [
    recipe.readyInMinutes !== null ? `${recipe.readyInMinutes} min` : null,
    recipe.servings !== null ? `serves ${recipe.servings}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    // `transparent` matches the app's other (working) modals — the opaque
    // fullScreen presentation was the one variant whose header taps died on
    // device. The root view carries the solid surface background instead.
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close cook mode"
          >
            <X size={22} color={tokens.color.ink} />
          </Pressable>
          <Text style={styles.counter} numberOfLines={1}>
            {phase === 'prep' ? 'Get set up' : total > 0 ? `Step ${idx + 1} of ${total}` : 'Cook'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {phase === 'steps' && (
          <>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${total > 0 ? ((idx + 1) / total) * 100 : 0}%` }]} />
            </View>
            <Text style={styles.encourage}>{encouragement(idx, total)}</Text>
            {timerElsewhere && timer && (
              <Pressable
                style={styles.timerPill}
                onPress={() => setIdx(timer.stepIdx)}
                accessibilityRole="button"
                accessibilityLabel={`Return to the timer on step ${timer.stepIdx + 1}`}
              >
                <Timer size={14} color={tokens.color.accent} />
                <Text style={styles.timerPillTxt}>
                  {remaining === 0
                    ? `Time's up · Step ${timer.stepIdx + 1}`
                    : `${formatClock(remaining)} · Step ${timer.stepIdx + 1}`}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {phase === 'prep' ? (
          <ScrollView contentContainerStyle={styles.prepScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.prepTitle}>Get set up</Text>
            <Text style={styles.prepSub}>Gather everything before you start — it makes cooking calmer.</Text>
            {metaLine.length > 0 && <Text style={styles.prepMeta}>{metaLine}</Text>}

            {equipment.length > 0 && (
              <View style={styles.prepSection}>
                <Text style={styles.prepLabel}>You&apos;ll need</Text>
                <View style={styles.equipChips}>
                  {equipment.map((e, i) => (
                    <View key={`${e}-${i}`} style={styles.equipChip}>
                      <Text style={styles.equipChipTxt}>{e}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.prepSection}>
              <Text style={styles.prepLabel}>Gather these</Text>
              {recipe.ingredients.length > 0 ? (
                recipe.ingredients.map((ing, i) => {
                  const got = gathered.has(i);
                  return (
                    <Pressable
                      key={`${ing.name}-${i}`}
                      style={styles.gatherRow}
                      onPress={() => toggleGather(i)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: got }}
                    >
                      <View style={[styles.checkbox, got && styles.checkboxOn]}>
                        {got && <Check size={12} color={tokens.color.onAccent} />}
                      </View>
                      <Text style={[styles.gatherTxt, got && styles.gatherTxtGot]}>{ing.original || ing.name}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.prepNote}>Ingredients are listed on each step.</Text>
              )}
            </View>
          </ScrollView>
        ) : current ? (
          <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
            {current.group ? <Text style={styles.group}>{current.group}</Text> : null}
            <View style={styles.stepHead}>
              <Text style={styles.stepLabel}>Step {idx + 1}</Text>
              {isDone && (
                <View style={styles.doneChip}>
                  <Check size={12} color={tokens.color.success} />
                  <Text style={styles.doneChipTxt}>Done</Text>
                </View>
              )}
            </View>
            <View style={styles.hero}>
              <TechniqueGlyph
                name={resolveStepGlyph(current.technique, current.step, idx, total)}
                size={88}
              />
            </View>
            <Text style={styles.stepText}>{current.step}</Text>

            {(timerOnThisStep || mins !== null) && (
              <View style={styles.timer}>
                {timerOnThisStep ? (
                  <View style={styles.timerRunning}>
                    <Text style={[styles.timerClock, remaining === 0 && styles.timerClockDone]}>
                      {remaining === 0 ? "Time's up!" : formatClock(remaining)}
                    </Text>
                    <View style={styles.timerCtrls}>
                      {remaining > 0 && (
                        <Pressable
                          style={styles.timerCtrl}
                          onPress={toggleTimer}
                          accessibilityRole="button"
                          accessibilityLabel={timer?.status === 'running' ? 'Pause timer' : 'Resume timer'}
                        >
                          {timer?.status === 'running' ? (
                            <Pause size={16} color={tokens.color.accent} />
                          ) : (
                            <Play size={16} color={tokens.color.accent} />
                          )}
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.timerCtrl}
                        onPress={resetTimer}
                        accessibilityRole="button"
                        accessibilityLabel="Reset timer"
                      >
                        <RotateCcw size={16} color={tokens.color.accent} />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    style={styles.timerStart}
                    onPress={startTimer}
                    accessibilityRole="button"
                    accessibilityLabel={`Start a ${mins} minute timer`}
                  >
                    <Timer size={16} color={tokens.color.accent} />
                    <Text style={styles.timerStartTxt}>Start {mins}-min timer</Text>
                  </Pressable>
                )}
              </View>
            )}

            {current.ingredients.length > 0 && (
              <View style={styles.ingBlock}>
                <Text style={styles.ingLabel}>For this step</Text>
                <View style={styles.ingChips}>
                  {current.ingredients.map((nm, i) => (
                    <View key={`${nm}-${i}`} style={styles.ingChip}>
                      <Text style={styles.ingChipTxt}>{amountFor(nm)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.stepScroll}>
            <Text style={styles.stepText}>No steps to show.</Text>
          </View>
        )}

        {phase === 'prep' ? (
          <View style={styles.footer}>
            <Pressable
              style={styles.primaryBtn}
              onPress={startCooking}
              accessibilityRole="button"
              accessibilityLabel="Start the steps"
            >
              <Text style={styles.primaryTxt}>Start the steps</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.footer}>
            <Pressable
              style={styles.navBtn}
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={idx === 0 ? 'Back to setup' : 'Previous step'}
            >
              <ArrowLeft size={18} color={tokens.color.accent} />
              <Text style={styles.navTxt}>Back</Text>
            </Pressable>
            <Pressable
              style={styles.primaryBtn}
              onPress={onForward}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'I made this — update pantry' : 'Mark step done and continue'}
            >
              {isLast ? (
                <Text style={styles.primaryTxt}>I made this!</Text>
              ) : (
                <>
                  <Check size={18} color={tokens.color.onAccent} />
                  <Text style={styles.primaryTxt}>Done</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(5),
    paddingVertical: tokens.space(3),
  },
  counter: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.inkMuted, letterSpacing: 0.5 },
  // A real 40pt target (was a bare 24px icon) — mirrors RecipeDetail's backBtn.
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surfaceAlt,
  },
  headerSpacer: { width: 40 },
  track: {
    height: 4,
    marginHorizontal: tokens.space(5),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 999, backgroundColor: tokens.color.accent },
  encourage: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    paddingHorizontal: tokens.space(5),
    marginTop: tokens.space(2),
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: tokens.space(2),
    marginHorizontal: tokens.space(5),
    marginTop: tokens.space(2),
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.accentSoft,
  },
  timerPillTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12.5, color: tokens.color.accent, fontVariant: ['tabular-nums'] },
  // --- prep / mise en place ---
  prepScroll: { flexGrow: 1, paddingHorizontal: tokens.space(7), paddingTop: tokens.space(5), paddingBottom: tokens.space(8) },
  prepTitle: {
    fontFamily: tokens.font.display.bold,
    fontSize: 26,
    color: tokens.color.ink,
    letterSpacing: -0.4,
    marginBottom: tokens.space(2),
  },
  prepSub: { fontFamily: tokens.font.body.regular, fontSize: 15, lineHeight: 21, color: tokens.color.inkMuted },
  prepMeta: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent, marginTop: tokens.space(2) },
  prepSection: { marginTop: tokens.space(6) },
  prepLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(3),
  },
  equipChips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  equipChip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  equipChipTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.ink },
  gatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.sm,
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  gatherTxt: { flex: 1, fontFamily: tokens.font.body.regular, fontSize: 16, color: tokens.color.ink, lineHeight: 21 },
  gatherTxtGot: { color: tokens.color.inkMuted, textDecorationLine: 'line-through' },
  prepNote: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, lineHeight: 20 },
  // --- steps ---
  stepScroll: { flexGrow: 1, paddingHorizontal: tokens.space(7), paddingVertical: tokens.space(6) },
  group: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.secondary,
    marginBottom: tokens.space(2),
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2), marginBottom: tokens.space(3) },
  // The technique hero — a constant slot so the step text never jumps
  // between steps (glanceability mid-cook, per the design spec).
  hero: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceAlt,
    marginBottom: tokens.space(4),
  },
  stepLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.accent,
  },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: 2,
    paddingHorizontal: tokens.space(2),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  doneChipTxt: { fontFamily: tokens.font.body.semibold, fontSize: 11, color: tokens.color.success },
  stepText: { fontFamily: tokens.font.display.regular, fontSize: 24, lineHeight: 34, color: tokens.color.ink, letterSpacing: -0.2 },
  timer: { marginTop: tokens.space(6) },
  timerStart: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: tokens.space(2),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  timerStartTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.accent },
  timerRunning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceAlt,
  },
  timerClock: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  timerClockDone: { color: tokens.color.warning, fontSize: 20 },
  timerCtrls: { flexDirection: 'row', gap: tokens.space(2) },
  timerCtrl: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  ingBlock: { marginTop: tokens.space(6) },
  ingLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  ingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  ingChip: {
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  ingChipTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.ink },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingHorizontal: tokens.space(5),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(2),
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.md,
  },
  navTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.accent },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accent,
  },
  primaryTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
});
