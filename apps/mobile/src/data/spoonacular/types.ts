/**
 * Subset of Spoonacular's recipe responses — only the fields we use.
 * Full schema at https://spoonacular.com/food-api/docs#Search-Recipes-by-Ingredients.
 */
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
  /** Spoonacular 0–100 healthiness score; null when the API omits it. */
  healthScore: number | null;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
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
}

export type FindByIngredientsResponse = RawFindByIngredientsRecipe[];
