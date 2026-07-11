/**
 * recipeCollections — the Cookbook + collection axes for recipes (pure, no I/O).
 *
 * The mirror of collections.ts, but for dishes: cooking a recipe COLLECTS it.
 * Honest by construction — it rewards actually cooking (the cookLog / activity
 * 'cooked' events feed in), never opening or grinding. Three views come out:
 *
 *   - cookbook   — distinct recipes cooked out of the whole catalog.
 *   - cuisines   — the "passport": one slot per cuisine in the catalog, filled
 *                  once you've cooked any dish from it.
 *   - meals      — breakfast / main / dessert / snack, same rule.
 *
 * Plus per-recipe cookCounts + firstCooked for the card backs ("first cooked
 * Feb 3 · made 5×"). Catalog is passed in (see recipeGraph.RecipeMeta) so core
 * stays dependency-free.
 */
import type { RecipeMeta } from './recipeGraph.ts';

/** A cook event, trimmed to what collections need (cookLog / activity). */
export interface CookEventLite {
  recipeId: number;
  cookedAt: string; // ISO
}

export interface AxisSlot {
  /** Canonical key ("italian", "breakfast"). */
  key: string;
  /** Display label ("Italian", "Breakfast"). */
  label: string;
  /** Cooked at least one dish of this kind. */
  collected: boolean;
  /** How many distinct cooked recipes fall under it. */
  count: number;
}

export interface RecipeAxis {
  slots: AxisSlot[];
  collected: number;
  total: number;
}

export interface RecipeCollectionsSummary {
  cookbook: { collected: number; total: number; complete: boolean };
  cuisines: RecipeAxis;
  meals: RecipeAxis;
  /** recipeId → times cooked. */
  cookCounts: Record<number, number>;
  /** recipeId → earliest cookedAt (ISO). */
  firstCooked: Record<number, string>;
}

/** Meal types in menu order (only those present in the catalog surface). */
const MEAL_ORDER = ['breakfast', 'main course', 'dessert', 'snack'];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function axis(slots: AxisSlot[]): RecipeAxis {
  return { slots, collected: slots.filter((s) => s.collected).length, total: slots.length };
}

export function computeRecipeCollections(
  cookEvents: CookEventLite[],
  catalog: RecipeMeta[],
): RecipeCollectionsSummary {
  const byId = new Map(catalog.map((r) => [r.id, r]));

  const cookCounts: Record<number, number> = {};
  const firstCooked: Record<number, string> = {};
  for (const e of cookEvents) {
    if (!byId.has(e.recipeId)) continue; // ignore cooks of recipes not in the catalog
    cookCounts[e.recipeId] = (cookCounts[e.recipeId] ?? 0) + 1;
    const prev = firstCooked[e.recipeId];
    if (!prev || e.cookedAt < prev) firstCooked[e.recipeId] = e.cookedAt;
  }
  const cookedIds = new Set(Object.keys(cookCounts).map(Number));

  const cookbook = {
    collected: cookedIds.size,
    total: catalog.length,
    complete: catalog.length > 0 && cookedIds.size === catalog.length,
  };

  // Cuisine passport — one slot per distinct cuisine present in the catalog.
  const cuisineKeys = [...new Set(catalog.flatMap((r) => r.cuisines))].filter(Boolean).sort();
  const cuisineSlots: AxisSlot[] = cuisineKeys.map((key) => {
    const count = catalog.filter((r) => cookedIds.has(r.id) && r.cuisines.includes(key)).length;
    return { key, label: titleCase(key), collected: count > 0, count };
  });

  // Meal types — fixed menu order, only those the catalog actually has.
  const mealKeys = MEAL_ORDER.filter((m) => catalog.some((r) => r.mealType === m));
  const mealSlots: AxisSlot[] = mealKeys.map((key) => {
    const count = catalog.filter((r) => cookedIds.has(r.id) && r.mealType === key).length;
    return { key, label: titleCase(key), collected: count > 0, count };
  });

  return {
    cookbook,
    cuisines: axis(cuisineSlots),
    meals: axis(mealSlots),
    cookCounts,
    firstCooked,
  };
}
