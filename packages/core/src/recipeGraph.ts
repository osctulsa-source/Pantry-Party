/**
 * recipeGraph — the food ↔ recipe link that makes the two collections feed each
 * other (pure, no I/O). This is the "crafting tree": ingredient cards know the
 * dishes they belong to, recipe cards know which ingredients they need, and the
 * whole thing runs off the SAME token matcher the Cook flow uses (cooked.ts),
 * so a food never matches here but miss on the Cook tab (or vice versa).
 *
 * The recipe catalog is passed IN (RecipeMeta[]) rather than imported, so this
 * module — and all of @breadbox/core — stays dependency-free and testable; the
 * mobile layer hands over its bundled curated set (a structural superset).
 *
 * Powers: the card back's "recipes that use this", the "recipes within reach"
 * teaser, and the signature-recipe reveal when a variety set completes. None of
 * these gate anything — they surface real, cookable dishes.
 */
import { normalizeFoodTokens } from './cooked.ts';

/** Minimal recipe shape the graph + collections need (curated set is a superset). */
export interface RecipeMeta {
  id: number;
  title: string;
  cuisines: string[];
  mealType: string;
  difficulty: string;
  ingredients: { name: string }[];
}

/** Tiny staple set that shouldn't count as "missing" (mirrors curatedSource). */
const ASSUMED_STAPLES = new Set(['salt', 'pepper', 'water', 'salt and pepper']);

function tokenSet(name: string): Set<string> {
  return new Set(normalizeFoodTokens(name));
}

/** True when a food and an ingredient share any normalized token. */
function shares(a: Set<string>, bTokens: string[]): boolean {
  return bTokens.some((t) => a.has(t));
}

/** Every recipe whose ingredient list references the given food. */
export function recipesUsingFood(food: string, catalog: RecipeMeta[]): RecipeMeta[] {
  const foodTokens = normalizeFoodTokens(food);
  if (foodTokens.length === 0) return [];
  const foodSet = new Set(foodTokens);
  return catalog.filter((r) =>
    r.ingredients.some((ing) => shares(foodSet, normalizeFoodTokens(ing.name))),
  );
}

export interface RecipeMatch {
  recipe: RecipeMeta;
  /** Ingredient names you already have (staples always count). */
  have: string[];
  /** Ingredient names you're missing. */
  missing: string[];
}

/** Split one recipe's ingredients into have / missing against pantry names. */
export function matchRecipe(recipe: RecipeMeta, pantryNames: string[]): RecipeMatch {
  const pantry = pantryNames.map(tokenSet).filter((s) => s.size > 0);
  const have: string[] = [];
  const missing: string[] = [];
  for (const ing of recipe.ingredients) {
    if (ASSUMED_STAPLES.has(ing.name.toLowerCase())) {
      have.push(ing.name);
      continue;
    }
    const tokens = normalizeFoodTokens(ing.name);
    const found = tokens.length > 0 && pantry.some((p) => shares(p, tokens));
    (found ? have : missing).push(ing.name);
  }
  return { recipe, have, missing };
}

/**
 * Recipes you could make now or nearly — at least one ingredient in hand and no
 * more than `maxMissing` short. Sorted closest-to-cookable first. This is the
 * honest "unlock": the reward is a dish you can actually cook, never a wall.
 */
export function recipesWithinReach(
  catalog: RecipeMeta[],
  pantryNames: string[],
  maxMissing = 2,
): RecipeMatch[] {
  return catalog
    .map((r) => matchRecipe(r, pantryNames))
    .filter((m) => m.have.length > 0 && m.missing.length > 0 && m.missing.length <= maxMissing)
    .sort((a, b) => a.missing.length - b.missing.length || b.have.length - a.have.length);
}

/**
 * The recipe that best showcases a food — the "signature" card revealed when a
 * variety set completes (a celebration, not a gate). Prefers the recipe where
 * the food is most central (fewest total ingredients), then the shortest title.
 */
export function signatureRecipe(food: string, catalog: RecipeMeta[]): RecipeMeta | null {
  const using = recipesUsingFood(food, catalog);
  if (using.length === 0) return null;
  return [...using].sort(
    (a, b) => a.ingredients.length - b.ingredients.length || a.title.length - b.title.length,
  )[0] ?? null;
}
