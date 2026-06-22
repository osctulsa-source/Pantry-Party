/**
 * rowToFavoriteRecipe — the single SQLite-row → domain mapper for
 * favorite_recipes (the mapRow.ts pattern: snake_case SQLite primitives →
 * validated camelCase domain shape; one mapper, every consumer imports it).
 *
 * `payload` stays a JSON string here; favoriteToRecipe() (recipes feature)
 * JSON.parses it into a SpoonacularRecipe when opening Recipe Detail.
 */
import { parseFavoriteRecipe, type FavoriteRecipe } from '@breadbox/core';

import type { FavoriteRecipeRow } from './schema';

export function rowToFavoriteRecipe(row: FavoriteRecipeRow): FavoriteRecipe {
  return parseFavoriteRecipe({
    id: row.id,
    householdId: row.household_id,
    recipeId: row.recipe_id,
    title: row.title,
    image: row.image ?? undefined,
    readyMinutes: row.ready_minutes ?? undefined,
    healthScore: row.health_score ?? undefined,
    payload: row.payload,
    addedBy: row.added_by,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  });
}
