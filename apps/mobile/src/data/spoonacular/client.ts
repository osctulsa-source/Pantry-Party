/**
 * Spoonacular API client — walking skeleton scope.
 *
 * Wraps findByIngredients: takes a list of ingredient names, returns matching
 * recipes ranked by Spoonacular's default heuristic ("maximize used ingredients").
 *
 * Walking-skeleton deferrals:
 * - No caching (each call uses 1 of 50 daily free-tier points; fine for dev)
 * - No retry logic for transient failures
 * - No request deduplication
 * - No expiration-weighted ranking (Killer 3 work)
 *
 * API key comes from EXPO_PUBLIC_SPOONACULAR_API_KEY. Production would proxy
 * through a backend; walking-skeleton accepts client-side key exposure given
 * the free tier's 50/day throttle.
 */
import type { FindByIngredientsResponse, SpoonacularRecipe } from './types';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes';

export interface FindByIngredientsOptions {
  number?: number;        // how many recipes to return (default 5)
  ignorePantry?: boolean; // ignore common staples like salt/pepper (default true)
}

export async function findByIngredients(
  ingredients: string[],
  opts: FindByIngredientsOptions = {},
): Promise<SpoonacularRecipe[]> {
  const apiKey = process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SPOONACULAR_API_KEY. Sign up at spoonacular.com/food-api ' +
      'and add the key to apps/mobile/.env.local.',
    );
  }
  if (ingredients.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    ingredients: ingredients.join(','),
    number: String(opts.number ?? 5),
    ignorePantry: String(opts.ignorePantry ?? true),
    ranking: '1',  // maximize used ingredients
    apiKey,
  });

  const res = await fetch(`${SPOONACULAR_BASE}/findByIngredients?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Spoonacular request failed: ${res.status} ${res.statusText}. ` +
      `Body: ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as FindByIngredientsResponse;
  return data;
}
