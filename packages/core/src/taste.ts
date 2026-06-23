/**
 * Taste profile + cook-frequency — pure recommendation logic shared by the
 * Cook tab (buildTasteProfile feeds ranking + the "Because you saved" row) and
 * the Favorites "you cook these often" section (topCooked). Lifted out of the
 * mobile screens (RecipesScreen / useActivity) so it can be unit-tested without
 * pulling in React Native.
 */
import { applyPrefEvent, type RecipePrefs } from './recipePrefs.ts';
import type { ActivityEvent } from './activity.ts';
import type { FavoriteRecipe } from './favorites.ts';

/**
 * Top recipes by cook count (Favorites "you cook these often"). Pure over the
 * already-loaded events — groups 'cooked' entries by recipe id (refId), counts,
 * sorts desc, takes `limit`. Non-cooked events, and cooked events without a
 * numeric refId, are ignored.
 */
export function topCooked(
  events: ActivityEvent[],
  limit: number,
): Array<{ recipeId: number; title: string; count: number }> {
  const byId = new Map<number, { title: string; count: number }>();
  for (const e of events) {
    if (e.kind !== 'cooked' || !e.refId) continue;
    const id = Number(e.refId);
    if (!Number.isFinite(id)) continue;
    const prev = byId.get(id);
    if (prev) prev.count += 1;
    else byId.set(id, { title: e.label, count: 1 });
  }
  return [...byId.entries()]
    .map(([recipeId, v]) => ({ recipeId, title: v.title, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Build a "taste profile" from the household's SAVED + COOKED recipes (both
 * synced, so it survives a reinstall even though the on-device prefs map
 * doesn't). Reuses the same token-weight engine as recipePrefs: each favorite
 * and each cook nudges its title tokens up, so scoreTitle() against this map
 * measures how much a candidate looks like what you actually keep and make.
 */
export function buildTasteProfile(favorites: FavoriteRecipe[], events: ActivityEvent[]): RecipePrefs {
  let profile: RecipePrefs = {};
  for (const f of favorites) profile = applyPrefEvent(profile, f.title, 'like');
  for (const c of topCooked(events, 12)) {
    // Weight frequently-cooked recipes harder (capped so one dish can't dominate).
    const reps = Math.min(c.count, 3);
    for (let i = 0; i < reps; i++) profile = applyPrefEvent(profile, c.title, 'like');
  }
  return profile;
}
