/**
 * FavoriteRecipe — a recipe a household has saved (Favorites feature).
 *
 * Saved explicitly via the heart on Cook This / Recipe Detail, or surfaced
 * from cook history. Household-shared + synced and durable across reinstalls —
 * unlike the prior on-device-only preference weights (recipePrefs).
 *
 * We persist the full recipe as an opaque JSON `payload` (the mobile
 * SpoonacularRecipe shape) so a favorite opens in Recipe Detail instantly and
 * offline, with NO new recipe-by-id endpoint — keeping the ADR-008/009 NestJS
 * trigger untripped. The denormalized columns (recipeId / title / image / …)
 * drive the favorites LIST without JSON-parsing every row.
 *
 * `payload` is a string here (not a structured recipe) on purpose: @breadbox/core
 * must not depend on the mobile SpoonacularRecipe type. Mobile JSON.parses it
 * when opening Recipe Detail.
 *
 * Dedupe is by recipeId per household, enforced in the client query + toggle
 * (un-favorite tombstones; re-favorite un-tombstones) rather than a DB UNIQUE
 * constraint — under-dedupe is the safe failure, and a UNIQUE/CHECK the client
 * can violate is the silent-sync-jam class migration 0002 killed.
 */

import { z } from "zod";

export const FavoriteRecipe = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),

  // Spoonacular recipe id — the dedupe + "is this favorited" key.
  recipeId: z.number().int(),

  // Denormalized display fields — the favorites list renders from these.
  title: z.string().min(1).max(300),
  image: z.string().optional(),
  readyMinutes: z.number().int().nonnegative().optional(),
  healthScore: z.number().int().optional(),

  // The full SpoonacularRecipe as JSON (opaque to core).
  payload: z.string(),

  addedBy: z.string(),
  addedAt: z.string().datetime(),

  // Sync bookkeeping — engine-owned, mirrors PantryItem / ShoppingListItem.
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type FavoriteRecipe = z.infer<typeof FavoriteRecipe>;

/** Validate a row at the read boundary. Throws on bad shape. */
export function parseFavoriteRecipe(input: unknown): FavoriteRecipe {
  return FavoriteRecipe.parse(input);
}
