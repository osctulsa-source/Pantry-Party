/**
 * CookModeView — hands-free, step-by-step cooking (the "calm cook-along").
 *
 * Launched from the recipe detail screen. One instruction at a time at a
 * comfortable reading size, and built to take the stress out of following a
 * recipe:
 *  - per-step ingredients: the amounts THIS step needs, inline — no scrolling
 *    back to the ingredient list (#110 per-step payload).
 *  - in-step timer: when a step is tagged with a duration (or one is detected
 *    in the text), a tap starts a countdown so you don't have to guess.
 *  - reassurance: a calm, stage-aware line so a nervous cook feels guided.
 *  - check-off: mark each step done (satisfying tick), the last one finishes
 *    into the "I made this" pantry decrement.
 *  - keep-awake: the screen stays on while you cook.
 *
 * Steps come from the recipe's grouped analyzedInstructions, flattened into a
 * single sequence; a group label ("For the sauce") rides above its steps.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Check, Pause, Play, RotateCcw, Timer, X } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';

interface FlatStep {
  group: string;
  step: string;
  ingredients: string[];
  lengthMinutes: number | null;
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
        });
      }
    }
    return flat;
  }, [recipe.instructions]);

  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const total = steps.length;
  const current = steps[idx];
  const isLast = idx >= total - 1;
  const isDone = done.has(idx);
  const mins = current ? current.lengthMinutes ?? parseMinutes(current.step) : null;

  // Each step gets its own fresh timer.
  useEffect(() => {
    setSecondsLeft(null);
    setRunning(false);
  }, [idx]);

  // Countdown tick — re-armed each second; fires a haptic at zero.
  useEffect(() => {
    if (!running || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setRunning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [running, secondsLeft]);

  function goBack() {
    Haptics.selectionAsync().catch(() => {});
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
    setSecondsLeft(mins * 60);
    setRunning(true);
  }
  function toggleTimer() {
    setRunning((r) => !r);
  }
  function resetTimer() {
    setSecondsLeft(null);
    setRunning(false);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close cook mode">
            <X size={24} color={tokens.color.ink} />
          </Pressable>
          <Text style={styles.counter} numberOfLines={1}>
            {total > 0 ? `Step ${idx + 1} of ${total}` : 'Cook'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${total > 0 ? ((idx + 1) / total) * 100 : 0}%` }]} />
        </View>
        <Text style={styles.encourage}>{encouragement(idx, total)}</Text>

        {current ? (
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
            <Text style={styles.stepText}>{current.step}</Text>

            {mins !== null && (
              <View style={styles.timer}>
                {secondsLeft === null ? (
                  <Pressable
                    style={styles.timerStart}
                    onPress={startTimer}
                    accessibilityRole="button"
                    accessibilityLabel={`Start a ${mins} minute timer`}
                  >
                    <Timer size={16} color={tokens.color.accent} />
                    <Text style={styles.timerStartTxt}>Start {mins}-min timer</Text>
                  </Pressable>
                ) : (
                  <View style={styles.timerRunning}>
                    <Text style={[styles.timerClock, secondsLeft === 0 && styles.timerClockDone]}>
                      {secondsLeft === 0 ? "Time's up!" : formatClock(secondsLeft)}
                    </Text>
                    <View style={styles.timerCtrls}>
                      {secondsLeft > 0 && (
                        <Pressable
                          style={styles.timerCtrl}
                          onPress={toggleTimer}
                          accessibilityRole="button"
                          accessibilityLabel={running ? 'Pause timer' : 'Resume timer'}
                        >
                          {running ? (
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
                )}
              </View>
            )}

            {current.ingredients.length > 0 && (
              <View style={styles.ingBlock}>
                <Text style={styles.ingLabel}>For this step</Text>
                <View style={styles.ingChips}>
                  {current.ingredients.map((name, i) => (
                    <View key={`${name}-${i}`} style={styles.ingChip}>
                      <Text style={styles.ingChipTxt}>{name}</Text>
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

        <View style={styles.footer}>
          <Pressable
            style={[styles.navBtn, idx === 0 && styles.navBtnDisabled]}
            onPress={goBack}
            disabled={idx === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous step"
          >
            <ArrowLeft size={18} color={idx === 0 ? tokens.color.inkMuted : tokens.color.accent} />
            <Text style={[styles.navTxt, idx === 0 && styles.navTxtDisabled]}>Back</Text>
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
  headerSpacer: { width: 24 },
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
  navBtnDisabled: { opacity: 0.5 },
  navTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.accent },
  navTxtDisabled: { color: tokens.color.inkMuted },
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
