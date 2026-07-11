/**
 * Your Kitchen — the household's taste home (evolved from Favorites, PR 2).
 *
 * Reached from the Cook tab header (route key is still 'Favorites'; the visible
 * title is "Your Kitchen"). Three stacked parts:
 *   1. Taste — an editable header of your flavor profile, or a dismissible
 *      "Set your taste" card that opens the quiz (TasteQuizSheet). Device-local
 *      per household (useTasteProfile); seeds Cook ranking in a later step.
 *   2. "You cook these often" — top recipes from the synced activity log.
 *   3. "Saved · N" — everything saved via the heart, household-shared + synced.
 *      Tapping a row opens Recipe Detail from the stored payload (no fetch).
 */
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Heart, Sparkles, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  FLAVOR_OPTIONS,
  isTasteProfileEmpty,
} from '@breadbox/core';

import { tokens } from '../../theme/tokens';
import { BrandEmptyArt } from '../../components/BrandDecor';
import { useFavorites, favoriteToRecipe } from './useFavorites';
import { useActivity, topCooked } from '../activity/useActivity';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useTasteProfile } from './useTasteProfile';
import { TasteQuizSheet } from './TasteQuizSheet';
import type { RootStackParamList } from '../../../App';

// slug -> display label, across every catalog the header might show.
const TASTE_LABELS = new Map<string, string>();
for (const o of [...CUISINE_OPTIONS, ...FLAVOR_OPTIONS, ...DIET_OPTIONS]) TASTE_LABELS.set(o.slug, o.label);
const SPEED_LABEL: Record<string, string> = { quick: 'Quick', project: 'Project cook' };

export function FavoritesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { favorites, toggleFavorite } = useFavorites();
  const { events } = useActivity();
  const cooked = useMemo(() => topCooked(events, 5), [events]);

  const { activeHouseholdId } = useActiveHousehold();
  const { profile, save, loaded: tasteLoaded } = useTasteProfile(activeHouseholdId);
  const [quizOpen, setQuizOpen] = useState(false);
  const [seedDismissed, setSeedDismissed] = useState(false);

  const hasTaste = !isTasteProfileEmpty(profile);
  const tasteChips = useMemo(() => {
    const out: string[] = [];
    for (const s of profile.cuisines) out.push(TASTE_LABELS.get(s) ?? s);
    for (const s of profile.flavors) out.push(TASTE_LABELS.get(s) ?? s);
    if (profile.speed) out.push(SPEED_LABEL[profile.speed] ?? profile.speed);
    for (const s of profile.diets) out.push(TASTE_LABELS.get(s) ?? s);
    return out;
  }, [profile]);

  const noLists = favorites.length === 0 && cooked.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tasteLoaded && hasTaste && (
          <View style={styles.tasteCard}>
            <View style={styles.tasteTop}>
              <Text style={styles.tasteLabel}>Your taste</Text>
              <Pressable
                onPress={() => setQuizOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Edit your taste"
              >
                <Text style={styles.tasteEdit}>Edit</Text>
              </Pressable>
            </View>
            <View style={styles.tasteChips}>
              {tasteChips.map((c, i) => (
                <View key={`${c}-${i}`} style={styles.tasteChip}>
                  <Text style={styles.tasteChipTxt}>{c}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.tasteFoot}>Shapes what rises to the top in Cook.</Text>
          </View>
        )}

        {tasteLoaded && !hasTaste && !seedDismissed && (
          <View style={styles.seedCard}>
            <View style={styles.seedIcon}>
              <Sparkles size={18} color={tokens.color.accent} />
            </View>
            <View style={styles.seedBodyWrap}>
              <Text style={styles.seedTitle}>Set your taste</Text>
              <Text style={styles.seedBody}>
                Answer a few quick questions and Cook starts leaning toward what you like.
              </Text>
              <Pressable
                onPress={() => setQuizOpen(true)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Take the taste quiz"
              >
                <Text style={styles.seedCta}>Take the quiz ›</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setSeedDismissed(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <X size={16} color={tokens.color.inkMuted} />
            </Pressable>
          </View>
        )}

        {cooked.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHead}>You cook these often</Text>
            {cooked.map((c) => (
              <View key={c.recipeId} style={styles.cookedRow}>
                <Text style={styles.cookedName} numberOfLines={1}>
                  {c.title}
                </Text>
                <Text style={styles.cookedCount}>{c.count}× cooked</Text>
              </View>
            ))}
          </View>
        )}

        {favorites.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHead}>Saved · {favorites.length}</Text>
            {favorites.map((fav) => (
              <Pressable
                key={fav.id}
                style={styles.row}
                onPress={() => navigation.navigate('RecipeDetail', { recipe: favoriteToRecipe(fav) })}
                accessibilityRole="button"
                accessibilityLabel={`Open ${fav.title}`}
              >
                {fav.image ? (
                  <Image source={{ uri: fav.image }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={2}>
                    {fav.title}
                  </Text>
                  {(fav.readyMinutes != null || (fav.healthScore != null && fav.healthScore >= 70)) && (
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {fav.readyMinutes != null ? `${fav.readyMinutes} min` : ''}
                      {fav.readyMinutes != null && fav.healthScore != null && fav.healthScore >= 70
                        ? ' · '
                        : ''}
                      {fav.healthScore != null && fav.healthScore >= 70 ? 'very healthy' : ''}
                    </Text>
                  )}
                </View>
                <Pressable
                  hitSlop={10}
                  style={styles.heartBtn}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    void toggleFavorite(favoriteToRecipe(fav));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${fav.title} from favorites`}
                >
                  <Heart size={20} color={tokens.color.accent} fill={tokens.color.accent} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : noLists ? (
          <View style={styles.emptyBlock}>
            <BrandEmptyArt foods={['cherry', 'croissant', 'grapes']} />
            <Text style={styles.emptyTitle}>No saved recipes yet</Text>
            <Text style={styles.emptyBody}>
              Tap the heart on any recipe — in Cook or on a recipe page — to save it here for the whole
              household.
            </Text>
          </View>
        ) : (
          <Text style={styles.savedHint}>
            Nothing saved yet — tap the heart on a recipe to keep it here.
          </Text>
        )}
      </ScrollView>

      <TasteQuizSheet
        visible={quizOpen}
        initial={profile}
        onClose={() => setQuizOpen(false)}
        onSave={save}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(4), paddingBottom: tokens.space(10) },

  tasteCard: {
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.lg,
    paddingVertical: tokens.space(4),
    paddingHorizontal: tokens.space(4),
    marginBottom: tokens.space(5),
  },
  tasteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space(3),
  },
  tasteLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: tokens.color.accent,
  },
  tasteEdit: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  tasteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginBottom: tokens.space(2) },
  tasteChip: {
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
  },
  tasteChipTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12.5, color: tokens.color.accent },
  tasteFoot: { fontFamily: tokens.font.body.regular, fontSize: 11.5, color: tokens.color.inkMuted },

  seedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.lg,
    padding: tokens.space(4),
    marginBottom: tokens.space(5),
  },
  seedIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: tokens.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedBodyWrap: { flex: 1 },
  seedTitle: { fontFamily: tokens.font.display.semibold, fontSize: 16, color: tokens.color.ink },
  seedBody: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    lineHeight: 19,
    marginTop: 2,
    marginBottom: tokens.space(2),
  },
  seedCta: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },

  section: { marginBottom: tokens.space(5) },
  sectionHead: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(3),
  },
  cookedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  cookedName: { flex: 1, fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  cookedCount: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  thumb: { width: 60, height: 60, borderRadius: tokens.radius.md, backgroundColor: tokens.color.line },
  thumbFallback: { backgroundColor: tokens.color.surfaceAlt },
  rowText: { flex: 1 },
  rowName: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink, lineHeight: 20 },
  rowMeta: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: 2 },
  heartBtn: { padding: tokens.space(2) },
  savedHint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    lineHeight: 19,
  },
  emptyBlock: { alignItems: 'center', paddingVertical: tokens.space(8), paddingHorizontal: tokens.space(4) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginTop: tokens.space(4),
    marginBottom: tokens.space(2),
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
