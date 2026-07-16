/**
 * Subset of Spoonacular's recipe responses — only the fields we use.
 * Full schema at https://spoonacular.com/food-api/docs#Search-Recipes-by-Ingredients.
 */

/** One ingredient line for the detail screen. `original` is the display string ("2 cups flour"). */
export interface RecipeIngredient {
  name: string;
  original: string;
  amount: number | null;
  unit: string;
}

/** A numbered step in the detail screen's instructions + the cook-along. */
export interface RecipeStep {
  number: number;
  step: string;
  /** Ingredient names used in THIS step (cook-along "for this step" line). Empty for older cached responses. */
  ingredients: string[];
  /** Equipment names this step needs (mise en place + per-step hints). Empty for older cached responses. */
  equipment: string[];
  /** Step duration in minutes when tagged — drives in-step timers. null otherwise. */
  lengthMinutes: number | null;
  /** Authored technique id for the cook-mode glyph ("none" suppresses the keyword matcher). Curated pipeline only; absent everywhere else. */
  technique?: string;
}

/** A (possibly named) block of steps, e.g. "For the sauce". `name` is '' for the main block. */
export interface RecipeInstructionGroup {
  name: string;
  steps: RecipeStep[];
}

export interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  likes: number;
  /**
   * Names of the caller's ingredients this recipe uses (from
   * findByIngredients' / complexSearch+fillIngredients' usedIngredients).
   * Feeds the "I cooked this" pantry matcher; empty when the API omits them.
   */
  usedIngredientNames: string[];
  /**
   * Names of the ingredients the recipe needs that the caller DOESN'T have —
   * feeds "Add N missing to list" (shopping). Empty when the API omits them
   * (older cached proxy responses predate the passthrough).
   */
  missedIngredientNames: string[];
  /** Spoonacular 0–100 healthiness score; null when the API omits it. */
  healthScore: number | null;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  // --- detail-screen fields (recipe-detail arc) -------------------------
  // All ride along on the SAME proxy response the cards already use — the
  // server stopped discarding them. Empty / null for older cached responses
  // that predate the passthrough, so the detail screen must degrade gracefully.
  /** Minutes to make; null when the API omits it. */
  readyInMinutes: number | null;
  /** Servings the recipe yields; null when the API omits it. */
  servings: number | null;
  /** Original recipe URL — shown as attribution (Spoonacular terms). '' when absent. */
  sourceUrl: string;
  /** Human-readable source/site name for attribution. '' when absent. */
  sourceName: string;
  /** Spoonacular HTML summary — strip before display. '' when absent. */
  summary: string;
  /** Full ingredient list with display strings + amounts. Empty for older cached responses. */
  ingredients: RecipeIngredient[];
  /** Grouped, numbered step-by-step instructions. Empty when the API omits them. */
  instructions: RecipeInstructionGroup[];
}

/** Raw findByIngredients response item — the superset we map down from. */
export interface RawFindByIngredientsRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  likes?: number;
  usedIngredients?: Array<{ name?: string }>;
  missedIngredients?: Array<{ name?: string }>;
}

export type FindByIngredientsResponse = RawFindByIngredientsRecipe[];
