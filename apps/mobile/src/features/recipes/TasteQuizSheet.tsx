/**
 * TasteQuizSheet — the dismissible flavor-profile quiz (Your Kitchen, PR 2).
 *
 * A slide-up sheet with three quick steps — cuisines, flavor leanings, then
 * weeknight rhythm + hard dietary lines — rendered from the @breadbox/core
 * option catalogs so the quiz and the seeding math never drift. On "Build my
 * taste" it hands a TasteProfile back to the parent (useTasteProfile persists
 * it); "Skip" / swipe-down closes without changing anything.
 *
 * Cold-start only seeds ranking from cuisines + flavors (see seedPrefsFromTaste);
 * speed + diets are captured here for filtering in a later step.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import {
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  FLAVOR_OPTIONS,
  SPEED_OPTIONS,
  type TasteProfile,
  type TasteSpeed,
} from '@breadbox/core';

import { tokens } from '../../theme/tokens';

const STEP_COUNT = 3;

function toggle(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

export function TasteQuizSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: TasteProfile;
  onClose: () => void;
  onSave: (profile: TasteProfile) => void;
}) {
  const [step, setStep] = useState(0);
  const [cuisines, setCuisines] = useState<string[]>(initial.cuisines);
  const [flavors, setFlavors] = useState<string[]>(initial.flavors);
  const [speed, setSpeed] = useState<TasteSpeed | null>(initial.speed);
  const [diets, setDiets] = useState<string[]>(initial.diets);

  // Re-seed the working copy from the saved profile each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setCuisines(initial.cuisines);
    setFlavors(initial.flavors);
    setSpeed(initial.speed);
    setDiets(initial.diets);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => Haptics.selectionAsync().catch(() => {});

  function next() {
    tap();
    if (step < STEP_COUNT - 1) {
      setStep((s) => s + 1);
      return;
    }
    onSave({ cuisines, flavors, speed, diets, updatedAt: initial.updatedAt });
    onClose();
  }

  const titles = ['Which cuisines pull you in?', 'How do you like it to taste?', "What's a weeknight like?"];
  const subs = [
    "Pick a few — we'll lean your suggestions this way.",
    'Your flavor leanings nudge what rises to the top.',
    'And any hard lines we should never cross.',
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.safe}>
            <View style={styles.top}>
              <View style={styles.dots}>
                {Array.from({ length: STEP_COUNT }).map((_, i) => (
                  <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
                ))}
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={tokens.color.inkMuted} />
              </Pressable>
            </View>

            <Text style={styles.title}>{titles[step]}</Text>
            <Text style={styles.sub}>{subs[step]}</Text>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
              {step === 0 && (
                <View style={styles.chips}>
                  {CUISINE_OPTIONS.map((o) => {
                    const on = cuisines.includes(o.slug);
                    return (
                      <Pressable
                        key={o.slug}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => {
                          tap();
                          setCuisines((c) => toggle(c, o.slug));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={o.label}
                      >
                        <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {step === 1 && (
                <View style={styles.chips}>
                  {FLAVOR_OPTIONS.map((o) => {
                    const on = flavors.includes(o.slug);
                    return (
                      <Pressable
                        key={o.slug}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() => {
                          tap();
                          setFlavors((f) => toggle(f, o.slug));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={o.label}
                      >
                        <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {step === 2 && (
                <View>
                  <View style={styles.pick}>
                    {SPEED_OPTIONS.map((o) => {
                      const on = speed === o.slug;
                      return (
                        <Pressable
                          key={o.slug}
                          style={[styles.pcard, on && styles.pcardOn]}
                          onPress={() => {
                            tap();
                            setSpeed((prev) => (prev === o.slug ? null : o.slug));
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={o.label}
                        >
                          <Text style={styles.pcardTitle}>{o.label}</Text>
                          <Text style={styles.pcardHint}>{o.hint}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.subLabel}>Dietary lines</Text>
                  <View style={styles.chips}>
                    {DIET_OPTIONS.map((o) => {
                      const on = diets.includes(o.slug);
                      return (
                        <Pressable
                          key={o.slug}
                          style={[styles.chip, on && styles.chipSoftOn]}
                          onPress={() => {
                            tap();
                            setDiets((d) => toggle(d, o.slug));
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={o.label}
                        >
                          <Text style={[styles.chipTxt, on && styles.chipTxtSoftOn]}>{o.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              {step > 0 && (
                <Pressable
                  style={styles.back}
                  onPress={() => {
                    tap();
                    setStep((s) => Math.max(0, s - 1));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <Text style={styles.backTxt}>Back</Text>
                </Pressable>
              )}
              <Pressable style={styles.cta} onPress={next} accessibilityRole="button">
                <Text style={styles.ctaTxt}>{step < STEP_COUNT - 1 ? 'Next' : 'Build my taste'}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,8,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    maxHeight: '88%',
    minHeight: '62%',
  },
  safe: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(5), flexShrink: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space(5) },
  dots: { flexDirection: 'row', gap: tokens.space(2) },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: tokens.color.line },
  dotOn: { width: 20, backgroundColor: tokens.color.accent },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 23,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    marginBottom: tokens.space(2),
  },
  sub: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, marginBottom: tokens.space(5) },
  body: { flexGrow: 0 },
  bodyContent: { paddingBottom: tokens.space(4) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(4),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  chipOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  chipSoftOn: { backgroundColor: tokens.color.accentSoft, borderColor: tokens.color.accentSoft },
  chipTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.ink },
  chipTxtOn: { color: tokens.color.onAccent },
  chipTxtSoftOn: { color: tokens.color.accent },
  pick: { gap: tokens.space(3), marginBottom: tokens.space(5) },
  pcard: {
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space(4),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
  },
  pcardOn: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  pcardTitle: { fontFamily: tokens.font.display.semibold, fontSize: 16, color: tokens.color.ink, marginBottom: 2 },
  pcardHint: { fontFamily: tokens.font.body.regular, fontSize: 12.5, color: tokens.color.inkMuted },
  subLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(3),
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(2),
  },
  back: { paddingVertical: tokens.space(3), paddingHorizontal: tokens.space(4) },
  backTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.inkMuted },
  cta: {
    flex: 1,
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space(4),
    alignItems: 'center',
  },
  ctaTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
});
