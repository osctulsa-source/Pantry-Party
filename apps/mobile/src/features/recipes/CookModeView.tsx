/**
 * CookModeView — hands-free, step-by-step cooking.
 *
 * Launched from the recipe detail screen. Shows one instruction at a time at a
 * comfortable reading size, with a progress bar and Back/Next, and keeps the
 * screen awake while you cook (useKeepAwake — ships with the expo package).
 * The last step's button is "I made this!", which hands off to the detail
 * screen's CookedItSheet (pantry decrement) via onFinish.
 *
 * Steps come from the recipe's grouped analyzedInstructions (#102 payload),
 * flattened into a single sequence; a group label ("For the sauce") rides above
 * its steps. Rendered only when the recipe actually has steps.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ArrowRight, X } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';

interface FlatStep {
  group: string;
  step: string;
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
      for (const s of group.steps) flat.push({ group: group.name, step: s.step });
    }
    return flat;
  }, [recipe.instructions]);

  const [idx, setIdx] = useState(0);
  const total = steps.length;
  const current = steps[idx];
  const isLast = idx >= total - 1;

  function go(delta: number) {
    Haptics.selectionAsync().catch(() => {});
    setIdx((i) => Math.min(Math.max(i + delta, 0), total - 1));
  }
  function finish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onFinish();
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

        {current ? (
          <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
            {current.group ? <Text style={styles.group}>{current.group}</Text> : null}
            <Text style={styles.stepLabel}>Step {idx + 1}</Text>
            <Text style={styles.stepText}>{current.step}</Text>
          </ScrollView>
        ) : (
          <View style={styles.stepScroll}>
            <Text style={styles.stepText}>No steps to show.</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable
            style={[styles.navBtn, idx === 0 && styles.navBtnDisabled]}
            onPress={() => go(-1)}
            disabled={idx === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous step"
          >
            <ArrowLeft size={18} color={idx === 0 ? tokens.color.inkMuted : tokens.color.accent} />
            <Text style={[styles.navTxt, idx === 0 && styles.navTxtDisabled]}>Back</Text>
          </Pressable>
          {isLast ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={finish}
              accessibilityRole="button"
              accessibilityLabel="I made this — update pantry"
            >
              <Text style={styles.primaryTxt}>I made this!</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => go(1)}
              accessibilityRole="button"
              accessibilityLabel="Next step"
            >
              <Text style={styles.primaryTxt}>Next</Text>
              <ArrowRight size={18} color={tokens.color.onAccent} />
            </Pressable>
          )}
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
  stepScroll: { flexGrow: 1, paddingHorizontal: tokens.space(7), paddingVertical: tokens.space(8) },
  group: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.secondary,
    marginBottom: tokens.space(2),
  },
  stepLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(3),
  },
  stepText: { fontFamily: tokens.font.display.regular, fontSize: 24, lineHeight: 34, color: tokens.color.ink, letterSpacing: -0.2 },
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
