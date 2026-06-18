/**
 * Recipe search client — talks to OUR api (services/api POST /recipes/search),
 * which proxies Spoonacular server-side.
 *
 * The Spoonacular key no longer ships in the client bundle (external review
 * CRITICAL §2.8): the proxy holds it, rate-limits per user, and serves repeat
 * searches from a 24h cache so browsing doesn't burn free-tier quota.
 *
 * - findByIngredients: legacy walking-skeleton entry point — now served by the
 *   same proxy (complexSearch + max-used-ingredients ≈ the old ranking=1).
 *   `ignorePantry` is applied server-side.
 * - searchByMeal: meal-type filtered + offset-paged search. Returns SpoonacularRecipe[].
 *
 * Results carry used-ingredient names (the "I cooked this" matcher), missed-
 * ingredient names (the "Add N missing to list" shopping feeder), and the
 * detail-screen payload (time, servings, source, summary, full ingredients,
 * step-by-step instructions) — all on the SAME response, served from cache on
 * repeat. Detail fields are empty/null for older cached responses that predate
 * the proxy passthrough; the detail screen degrades gracefully.
 *
 * Auth: the proxy validates the same Supabase access token the upload-proxy
 * does; we read it from the live session.
 */
import type { MealType } from '@breadbox/core';

import { supabase } from '../supabase/client';
import type {
  RecipeIngredient,
  RecipeInstructionGroup,
  SpoonacularRecipe,
} from './types';

/** Extract clean ingredient names from an API ingredient array. */
function ingredientNames(list: Array<{ name?: string }> | undefined): string[] {
  return (list ?? []).map((i) => i.name ?? '').filter((n) => n.length > 0);
}

export interface FindByIngredientsOptions {
  number?: number; // how many recipes to return (default 5)
  ignorePantry?: boolean; // retained for call-site compat; the proxy always ignores staples
}

interface ProxySearchBody {
  ingredients: string[];
  type?: MealType;
  number?: number;
  offset?: number;
}

async function proxySearch(body: ProxySearchBody): Promise<ComplexSearchResponse> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL. Add it to apps/mobile/.env.local and restart Metro.',
    );
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Sign in to get recipe suggestions.');
  }

  const res = await fetch(`${apiUrl}/recipes/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    throw new Error('Easy there, chef — too many searches. Try again in a few minutes.');
  }
  if (!res.ok) {
    // The proxy logs upstream details server-side; clients get a calm message.
    throw new Error('Recipe search is unavailable right now. Try again shortly.');
  }
  return (await res.json()) as ComplexSearchResponse;
}

function mapResult(r: ComplexSearchResult): SpoonacularRecipe {
  return {
    id: r.id,
    title: r.title,
    image: r.image,
    usedIngredientCount: r.usedIngredientCount ?? 0,
    missedIngredientCount: r.missedIngredientCount ?? 0,
    likes: r.likes ?? 0,
    usedIngredientNames: ingredientNames(r.usedIngredients),
    missedIngredientNames: ingredientNames(r.missedIngredients),
    healthScore: typeof r.healthScore === 'number' ? r.healthScore : null,
    vegetarian: r.vegetarian ?? false,
    vegan: r.vegan ?? false,
    glutenFree: r.glutenFree ?? false,
    // Detail fields — the proxy already trimmed these; default for older
    // cached responses (and so an empty/short upstream can't crash a render).
    readyInMinutes: typeof r.readyInMinutes === 'number' ? r.readyInMinutes : null,
    servings: typeof r.servings === 'number' ? r.servings : null,
    sourceUrl: r.sourceUrl ?? '',
    sourceName: r.sourceName ?? '',
    summary: r.summary ?? '',
    ingredients: r.ingredients ?? [],
    instructions: r.instructions ?? [],
  };
}

export async function findByIngredients(
  ingredients: string[],
  opts: FindByIngredientsOptions = {},
): Promise<SpoonacularRecipe[]> {
  if (ingredients.length === 0) {
    return [];
  }

  const data = await proxySearch({ ingredients, number: opts.number ?? 5 });
  return (data.results ?? []).map(mapResult);
}

export interface SearchByMealOptions {
  type?: MealType; // omit for "any"
  number?: number;
  offset?: number; // page into the results (used by Refresh)
}

// Subset of the proxy's (complexSearch-shaped) result we consume.
interface ComplexSearchResult {
  id: number;
  title: string;
  image: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  likes?: number;
  usedIngredients?: Array<{ name?: string }>;
  missedIngredients?: Array<{ name?: string }>;
  healthScore?: number | null;
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  readyInMinutes?: number | null;
  servings?: number | null;
  sourceUrl?: string;
  sourceName?: string;
  summary?: string;
  ingredients?: RecipeIngredient[];
  instructions?: RecipeInstructionGroup[];
}
interface ComplexSearchResponse {
  results?: ComplexSearchResult[];
}

/**
 * Search by pantry ingredients, optionally constrained to a meal type and
 * paged via `offset`. The proxy requests fillIngredients upstream, so results
 * carry used/missed counts and ingredient names — the Cook This screen re-ranks
 * them, the "I cooked this" matcher reads the used names, and the shopping
 * feeder reads the missed names.
 */
export async function searchByMeal(
  ingredients: string[],
  opts: SearchByMealOptions = {},
): Promise<SpoonacularRecipe[]> {
  if (ingredients.length === 0) {
    return [];
  }

  const body: ProxySearchBody = { ingredients, number: opts.number ?? 8 };
  if (opts.type) body.type = opts.type;
  if (opts.offset) body.offset = opts.offset;

  const data = await proxySearch(body);
  return (data.results ?? []).map(mapResult);
}
