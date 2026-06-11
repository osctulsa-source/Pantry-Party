/**
 * Spoonacular API client.
 *
 * - findByIngredients: original walking-skeleton call (maximize used ingredients).
 * - searchByMeal: complexSearch by pantry ingredients, optionally filtered to a
 *   meal type (main course / breakfast / dessert / snack) and paged via `offset`
 *   (so "Refresh" returns the next batch of matches). Returns SpoonacularRecipe[].
 *
 * Deferrals: no caching (each call spends free-tier points), no retry, no dedupe.
 * API key from EXPO_PUBLIC_SPOONACULAR_API_KEY; production would proxy server-side.
 */
import type { MealType } from '@breadbox/core';

import type { FindByIngredientsResponse, SpoonacularRecipe } from './types';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes';

function requireApiKey(): string {
  const apiKey = process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SPOONACULAR_API_KEY. Sign up at spoonacular.com/food-api ' +
        'and add the key to apps/mobile/.env.local.',
    );
  }
  return apiKey;
}

/** Extract clean ingredient names from an API usedIngredients array. */
function ingredientNames(used: Array<{ name?: string }> | undefined): string[] {
  return (used ?? []).map((i) => i.name ?? '').filter((n) => n.length > 0);
}

export interface FindByIngredientsOptions {
  number?: number; // how many recipes to return (default 5)
  ignorePantry?: boolean; // ignore common staples like salt/pepper (default true)
}

export async function findByIngredients(
  ingredients: string[],
  opts: FindByIngredientsOptions = {},
): Promise<SpoonacularRecipe[]> {
  const apiKey = requireApiKey();
  if (ingredients.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    ingredients: ingredients.join(','),
    number: String(opts.number ?? 5),
    ignorePantry: String(opts.ignorePantry ?? true),
    ranking: '1', // maximize used ingredients
    apiKey,
  });

  const res = await fetch(`${SPOONACULAR_BASE}/findByIngredients?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Spoonacular request failed: ${res.status} ${res.statusText}. Body: ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as FindByIngredientsResponse;
  return data.map((r) => ({
    id: r.id,
    title: r.title,
    image: r.image,
    usedIngredientCount: r.usedIngredientCount ?? 0,
    missedIngredientCount: r.missedIngredientCount ?? 0,
    likes: r.likes ?? 0,
    usedIngredientNames: ingredientNames(r.usedIngredients),
  }));
}

export interface SearchByMealOptions {
  type?: MealType; // omit for "any"
  number?: number;
  offset?: number; // page into the results (used by Refresh)
}

// Subset of complexSearch's result shape we consume (with fillIngredients=true).
interface ComplexSearchResult {
  id: number;
  title: string;
  image: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  likes?: number;
  usedIngredients?: Array<{ name?: string }>;
}
interface ComplexSearchResponse {
  results?: ComplexSearchResult[];
}

/**
 * complexSearch by pantry ingredients, optionally constrained to a meal type and
 * paged via `offset`. fillIngredients=true gives used/missed counts so results map
 * to SpoonacularRecipe and the Cook This screen can re-rank them like before.
 */
export async function searchByMeal(
  ingredients: string[],
  opts: SearchByMealOptions = {},
): Promise<SpoonacularRecipe[]> {
  const apiKey = requireApiKey();
  if (ingredients.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    includeIngredients: ingredients.join(','),
    sort: 'max-used-ingredients',
    fillIngredients: 'true',
    ignorePantry: 'true',
    number: String(opts.number ?? 8),
    apiKey,
  });
  if (opts.type) params.set('type', opts.type);
  if (opts.offset) params.set('offset', String(opts.offset));

  const res = await fetch(`${SPOONACULAR_BASE}/complexSearch?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Spoonacular complexSearch failed: ${res.status} ${res.statusText}. Body: ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as ComplexSearchResponse;
  return (data.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    image: r.image,
    usedIngredientCount: r.usedIngredientCount ?? 0,
    missedIngredientCount: r.missedIngredientCount ?? 0,
    likes: r.likes ?? 0,
    usedIngredientNames: ingredientNames(r.usedIngredients),
  }));
}
