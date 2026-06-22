/**
 * FavoritesScreen — the household's saved recipes (Favorites feature).
 *
 * Reached from the heart in the Cook tab header. Lists everything saved via the
 * heart on a recipe card or on Recipe Detail — newest first, household-shared,
 * synced. Tapping a row opens the in-app Recipe Detail from the stored payload
 * (no fetch); the heart on a row un-saves it.
 *
 * "You cook these often" (PR 3): an auto section from the synced activity log —
 * the recipes you've confirmed cooking most. Informational (a frequency
 * signal); the cooked events don't carry a full recipe payload, so these rows
 * aren't openable unless the recipe is also saved below.
 */
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Heart } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tokens } from '../../theme/tokens';
import { CookEmptyArt } from '../../components/illustrations/CookEmptyArt';
import { useFavorites, favoriteToRecipe } from './useFavorites';
import { useActivity, topCooked } from '../activity/useActivity';
import type { RootStackParamList } from '../../../App';

export function FavoritesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { favorites, toggleFavorite } = useFavorites();
  const { events } = useActivity();
  const cooked = useMemo(() => topCooked(events, 5), [events]);

  if (favorites.length === 0 && cooked.length === 0) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <CookEmptyArt />
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.emptyBody}>
            Tap the heart on any recipe — in Cook or on a recipe page — to save it here for the whole
            household.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {cooked.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHead}>You cook these often</Text>
            {cooked.map((c) => (
              <View key={c.recipeId} style={styles.cookedRow}>
                <Text style={styles.cookedName} numberOfLines={1}>
                  {c.title}
                </Text>
                <Text style={styles.cookedCount}>
                  {c.count}× cooked
                </Text>
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
        ) : (
          <Text style={styles.savedHint}>
            Nothing saved yet — tap the heart on a recipe to keep it here.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(4), paddingBottom: tokens.space(10) },
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
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
