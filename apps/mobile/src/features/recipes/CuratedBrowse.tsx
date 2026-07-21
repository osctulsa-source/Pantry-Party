/**
 * CuratedBrowse — the zero-input Cook-tab state. When there's no pantry to
 * match against, we still lead with the new photography: a quick-first list of
 * curated house recipes, each tapping through to RecipeDetail, above a CTA that
 * routes back into Quick Add so the user can stock up. Deliberately NOT the
 * pantry-match card (no used/missed counts exist here) — a lean browse card.
 *
 * Optional `listHeader` (Cook title + controls) scrolls away with the browse
 * list — same behavior as the matched-recipe feed.
 */
import { useMemo, type ReactNode } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Clock, Plus, Users } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MealType } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { browseCurated } from '../../data/curated/curatedSource';
import { resolveRecipeImageSource } from '../../data/curated/resolveRecipeImage';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import type { RootStackParamList } from '../../../App';

export function CuratedBrowse({
  meal,
  onAddToPantry,
  listHeader,
}: {
  meal: MealType | 'any';
  onAddToPantry: () => void;
  /** Cook chrome — scrolls with this list, not sticky above it. */
  listHeader?: ReactNode;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const recipes = useMemo(
    () => browseCurated({ type: meal === 'any' ? undefined : meal, number: 20 }),
    [meal],
  );

  return (
    <FlatList
      style={styles.feed}
      data={recipes}
      keyExtractor={(r) => String(r.id)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={
        <View>
          {listHeader}
          <View style={styles.head}>
            <Text style={styles.title}>Nothing in your pantry yet</Text>
            <Text style={styles.sub}>
              Here's what the Pantry Party kitchen is cooking — add a few staples and we'll match
              recipes to what you actually have.
            </Text>
            <Pressable style={styles.cta} onPress={onAddToPantry} accessibilityRole="button">
              <Plus size={16} color={tokens.color.onAccent} />
              <Text style={styles.ctaTxt}>Add to your pantry</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <BrowseCard recipe={item} onOpen={() => navigation.navigate('RecipeDetail', { recipe: item })} />
      )}
    />
  );
}

function BrowseCard({ recipe, onOpen }: { recipe: SpoonacularRecipe; onOpen: () => void }) {
  const imageSource = resolveRecipeImageSource(recipe);
  return (
    <Pressable style={styles.card} onPress={onOpen} accessibilityRole="button">
      {imageSource ? (
        <Image source={imageSource} style={styles.img} />
      ) : (
        <View style={[styles.img, styles.imgPlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.metaRow}>
          {recipe.readyInMinutes !== null && (
            <View style={styles.metaChip}>
              <Clock size={12} color={tokens.color.inkMuted} />
              <Text style={styles.metaTxt}>{recipe.readyInMinutes} min</Text>
            </View>
          )}
          {recipe.servings !== null && (
            <View style={styles.metaChip}>
              <Users size={12} color={tokens.color.inkMuted} />
              <Text style={styles.metaTxt}>Serves {recipe.servings}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  feed: { flex: 1 },
  scroll: { paddingBottom: tokens.space(8) },
  head: {
    marginBottom: tokens.space(4),
    paddingHorizontal: tokens.space(4),
    paddingTop: tokens.space(2),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 22,
    color: tokens.color.ink,
    letterSpacing: -0.4,
    marginBottom: tokens.space(2),
  },
  sub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(4),
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(3),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
  },
  ctaTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  card: {
    flexDirection: 'row',
    gap: tokens.space(3),
    marginHorizontal: tokens.space(4),
    marginBottom: tokens.space(3),
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
    overflow: 'hidden',
  },
  img: { width: 96, height: 96, backgroundColor: tokens.color.surfaceAlt },
  imgPlaceholder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: tokens.color.line },
  cardBody: { flex: 1, paddingVertical: tokens.space(3), paddingRight: tokens.space(3), justifyContent: 'center' },
  cardTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1) },
  metaTxt: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted },
});
