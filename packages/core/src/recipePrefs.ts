/**
 * Recipe preference learning — pure, on-device. Tokenizes recipe titles and
 * keeps a per-token weight map; like/open nudge tokens up, skip nudges down.
 * Future suggestions are re-ranked by summing their title tokens' weights.
 *
 * This module is just the math — mobile persists the map per household
 * (see useRecipePrefs) and blends scoreTitle() with the raw ingredient match.
 */
export type RecipePrefs = Record<string, number>;
export type PrefEvent = 'like' | 'open' | 'skip';

// Common recipe-title filler that carries no taste signal.
const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'your', 'from', 'this', 'that', 'recipe', 'recipes',
  'easy', 'best', 'quick', 'homemade', 'style', 'dish', 'make', 'made', 'simple',
  'one', 'two', 'sheet', 'pan', 'pot', 'bowl', 'our', 'low', 'high',
]);

const WEIGHT: Record<PrefEvent, number> = { like: 2, open: 1, skip: -1.5 };
const CLAMP = 8;

/** Lowercased, de-duped content words from a title (drops stopwords + words < 3 chars). */
export function tokenizeTitle(title: string): string[] {
  const seen = new Set<string>();
  for (const w of title.toLowerCase().split(/[^a-z]+/)) {
    if (w.length >= 3 && !STOPWORDS.has(w)) seen.add(w);
  }
  return [...seen];
}

/** Returns a NEW prefs map with `title`'s tokens nudged by the event weight (clamped). */
export function applyPrefEvent(prefs: RecipePrefs, title: string, event: PrefEvent): RecipePrefs {
  const next: RecipePrefs = { ...prefs };
  const delta = WEIGHT[event];
  for (const tok of tokenizeTitle(title)) {
    const v = (next[tok] ?? 0) + delta;
    next[tok] = Math.max(-CLAMP, Math.min(CLAMP, v));
  }
  return next;
}

/** Sum of learned weights for a title's tokens (0 when nothing is learned yet). */
export function scoreTitle(prefs: RecipePrefs, title: string): number {
  let score = 0;
  for (const tok of tokenizeTitle(title)) score += prefs[tok] ?? 0;
  return score;
}
