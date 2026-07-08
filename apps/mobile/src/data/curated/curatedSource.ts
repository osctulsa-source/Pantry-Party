/**
 * Curated "house recipes" — Pantry Party's own bundled recipe database.
 *
 * 150 original recipes (authoring source of truth: data/recipes/ at the repo
 * root — SPEC.md + validator live there; THIS json is the bundle copy. When a
 * new batch is authored, update BOTH copies). All text is original work
 * ("Pantry Party Kitchen"); ids start at 9000001, far above Spoonacular's id
 * space, so favorites/prefs/history keyed on recipe.id can never collide.
 *
 * searchCurated() is the local twin of the server's /recipes/search: it matches
 * recipe ingredients against the pantry with the SAME core token matcher the
 * "I cooked this" flow uses, fills the used/missed fields the UI expects, and
 * returns ranked SpoonacularRecipe-shaped results. Zero network, zero quota —
 * which also makes the Cook tab work offline (the screen falls back to curated
 * results when the server search fails).
 */
import { matchCookedItems, type MealType } from '@breadbox/core';

import type { SpoonacularRecipe } from '../spoonacular/types';
import curatedJson from './curated.recipes.json';

export const CURATED_SOURCE_NAME = 'Pantry Party Kitchen';

/** The bundled shape: SpoonacularRecipe minus the pantry-relative fields
 *  (computed per search), plus the curated-only metadata. */
type CuratedBase = Omit<
  SpoonacularRecipe,
  'usedIngredientCount' | 'missedIngredientCount' | 'likes' | 'usedIngredientNames' | 'missedIngredientNames'
> & {
  difficulty: 'easy' | 'medium';
  mealType: MealType;
  cuisines: string[];
};

// JSON import types are structural; the dataset is validated against this shape
// by data/recipes/validate.mjs at authoring time.
const CURATED = curatedJson as unknown as CuratedBase[];

/** Pantry basics that shouldn't count against "missing" (mirrors the server
 *  search's ignorePantry behavior, deliberately tiny). */
const ASSUMED_STAPLES = new Set(['salt', 'pepper', 'salt and pepper', 'water']);

export interface CuratedSearchItem {
  id: string;
  name: string;
  quantity: number;
}

export interface CuratedSearchOptions {
  /** Meal filter; omit for any. */
  type?: MealType;
  /** Max results (default 6). */
  number?: number;
  /** Page through matches, same semantics as the server offset. */
  offset?: number;
}

/**
 * Match the pantry against the curated set. Returns full SpoonacularRecipe
 * objects (used/missed fields computed) ranked by pantry match — most used
 * ingredients first, then fewest missing, then title. Recipes with no pantry
 * overlap at all are omitted (same contract as the server search).
 */
export function searchCurated(
  items: CuratedSearchItem[],
  opts: CuratedSearchOptions = {},
): SpoonacularRecipe[] {
  if (items.length === 0) return [];
  const { type, number = 6, offset = 0 } = opts;

  const scored: SpoonacularRecipe[] = [];
  for (const r of CURATED) {
    if (type && r.mealType !== type) continue;
    const ingredientNames = r.ingredients.map((i) => i.name);
    const matches = matchCookedItems(ingredientNames, items);
    const used = [...new Set(matches.map((m) => m.matchedIngredient))];
    if (used.length === 0) continue;
    const missed = ingredientNames.filter(
      (n) => !used.includes(n) && !ASSUMED_STAPLES.has(n.toLowerCase()),
    );
    scored.push({
      ...r,
      likes: 0,
      usedIngredientNames: used,
      missedIngredientNames: missed,
      usedIngredientCount: used.length,
      missedIngredientCount: missed.length,
    });
  }

  scored.sort(
    (a, b) =>
      b.usedIngredientCount - a.usedIngredientCount ||
      a.missedIngredientCount - b.missedIngredientCount ||
      a.title.localeCompare(b.title),
  );
  return scored.slice(offset, offset + number);
}
