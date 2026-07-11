/**
 * useRecipeCollections — the "Cookbook" side of collections: recipes you've
 * cooked, a cuisine passport, and meal-type coverage, computed off the on-device
 * cook log via @breadbox/core's computeRecipeCollections.
 *
 * The recipe catalog is the bundled curated set (a structural superset of the
 * pure RecipeMeta the engine needs). Like useInsights, the cook log is
 * AsyncStorage (not reactive), so this re-reads on mount / household change —
 * fine for a screen you visit deliberately.
 */
import { useEffect, useState } from 'react';

import {
  computeRecipeCollections,
  type RecipeCollectionsSummary,
  type RecipeMeta,
} from '@breadbox/core';
import { readCookEvents } from '../recipes/cookLog';
import curatedJson from '../../data/curated/curated.recipes.json';

/** Bundled curated recipes as the pure RecipeMeta the engines consume. */
export const RECIPE_CATALOG = curatedJson as unknown as RecipeMeta[];

const EMPTY: RecipeCollectionsSummary = {
  cookbook: { collected: 0, total: RECIPE_CATALOG.length, complete: false },
  cuisines: { slots: [], collected: 0, total: 0 },
  meals: { slots: [], collected: 0, total: 0 },
  cookCounts: {},
  firstCooked: {},
};

export function useRecipeCollections(householdId: string | null): {
  recipes: RecipeCollectionsSummary;
  loading: boolean;
} {
  const [recipes, setRecipes] = useState<RecipeCollectionsSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setRecipes(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const events = await readCookEvents(householdId);
      if (cancelled) return;
      setRecipes(computeRecipeCollections(events, RECIPE_CATALOG));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  return { recipes, loading };
}
