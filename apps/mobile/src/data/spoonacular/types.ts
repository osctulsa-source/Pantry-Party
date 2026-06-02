/**
 * Subset of Spoonacular's findByIngredients response — only the fields we use.
 * Full schema at https://spoonacular.com/food-api/docs#Search-Recipes-by-Ingredients.
 */
export interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  likes: number;
}

export type FindByIngredientsResponse = SpoonacularRecipe[];
