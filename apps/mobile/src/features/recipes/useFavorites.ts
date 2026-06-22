/**
 * useFavorites — reactive saved-recipes for the active household + the
 * save/un-save toggle (Favorites feature, PR 2).
 *
 * favorite_recipes is synced (PR 1): the reactive useQuery re-renders on every
 * local write or sync delivery, so a save on one device shows for everyone in
 * the household and survives a reinstall — unlike the on-device recipePrefs
 * weights. toggleFavorite is dedupe-aware by recipe_id: un-saving tombstones
 * the row (deleted=1), re-saving the same recipe un-tombstones it, so no
 * duplicate rows accumulate (mirrors the PR-1 design — the proxy PATCH allowlist
 * for favorite_recipes is exactly {deleted, updated_at}).
 *
 * The full SpoonacularRecipe rides in `payload` (JSON) so the favorites list
 * and Recipe Detail open with NO recipe-by-id fetch (favoriteToRecipe parses it).
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';

import type { FavoriteRecipe } from '@breadbox/core';
import { rowToFavoriteRecipe } from '../../data/powersync/mapFavoriteRow';
import type { FavoriteRecipeRow } from '../../data/powersync/schema';
import { getPowerSync } from '../../data/powersync/db';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';

const FAVORITES_QUERY =
  'SELECT * FROM favorite_recipes WHERE deleted = 0 AND household_id = ? ORDER BY updated_at DESC';

/**
 * Reconstruct the full recipe from a saved favorite. `payload` is the JSON we
 * stored at save time; if it's somehow corrupt or predates a field, fall back
 * to the denormalized columns (RecipeDetail degrades gracefully on empty
 * ingredient/step arrays).
 */
export function favoriteToRecipe(fav: FavoriteRecipe): SpoonacularRecipe {
  try {
    const parsed = JSON.parse(fav.payload) as SpoonacularRecipe;
    if (parsed && typeof parsed.id === 'number') return parsed;
  } catch {
    // fall through to the denormalized fallback
  }
  return {
    id: fav.recipeId,
    title: fav.title,
    image: fav.image ?? '',
    usedIngredientCount: 0,
    missedIngredientCount: 0,
    likes: 0,
    usedIngredientNames: [],
    missedIngredientNames: [],
    healthScore: fav.healthScore ?? null,
    vegetarian: false,
    vegan: false,
    glutenFree: false,
    readyInMinutes: fav.readyMinutes ?? null,
    servings: null,
    sourceUrl: '',
    sourceName: '',
    summary: '',
    ingredients: [],
    instructions: [],
  };
}

export function useFavorites(): {
  favorites: FavoriteRecipe[];
  isFavorited: (recipeId: number) => boolean;
  toggleFavorite: (recipe: SpoonacularRecipe) => Promise<'saved' | 'removed'>;
} {
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;

  const { data: rows } = useQuery<FavoriteRecipeRow>(FAVORITES_QUERY, [activeHouseholdId ?? '']);
  const favorites = useMemo(() => rows.map(rowToFavoriteRecipe), [rows]);

  const favoritedIds = useMemo(() => new Set(favorites.map((f) => f.recipeId)), [favorites]);
  const isFavorited = useCallback((recipeId: number) => favoritedIds.has(recipeId), [favoritedIds]);

  const toggleFavorite = useCallback(
    async (recipe: SpoonacularRecipe): Promise<'saved' | 'removed'> => {
      if (!activeHouseholdId || !userId) return 'removed';
      const db = getPowerSync();
      const now = Date.now();
      // One row per recipe per household: reuse an existing row (deleted or not)
      // so re-saving un-tombstones rather than piling up duplicates.
      const existing = await db.getAll<{ id: string; deleted: number }>(
        'SELECT id, deleted FROM favorite_recipes WHERE household_id = ? AND recipe_id = ? LIMIT 1',
        [activeHouseholdId, recipe.id],
      );
      const row = existing[0];
      if (row) {
        const nextDeleted = row.deleted === 0 ? 1 : 0;
        await db.execute('UPDATE favorite_recipes SET deleted = ?, updated_at = ? WHERE id = ?', [
          nextDeleted,
          now,
          row.id,
        ]);
        return nextDeleted === 1 ? 'removed' : 'saved';
      }
      await db.execute(
        `INSERT INTO favorite_recipes
           (id, household_id, recipe_id, title, image, ready_minutes, health_score, payload, added_by, added_at, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          activeHouseholdId,
          recipe.id,
          recipe.title,
          recipe.image || null,
          recipe.readyInMinutes,
          recipe.healthScore,
          JSON.stringify(recipe),
          userId,
          new Date().toISOString(),
          now,
          0,
        ],
      );
      return 'saved';
    },
    [activeHouseholdId, userId],
  );

  return { favorites, isFavorited, toggleFavorite };
}
