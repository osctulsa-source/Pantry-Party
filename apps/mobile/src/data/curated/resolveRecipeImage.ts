import type { ImageSourcePropType } from 'react-native';

import { RECIPE_IMAGE_ASSETS } from './recipeImageAssets';

/** Resolve a recipe hero image: bundled asset first (offline), then remote URI. */
export function resolveRecipeImageSource(recipe: {
  id: number;
  image?: string | null;
}): ImageSourcePropType | null {
  const local = RECIPE_IMAGE_ASSETS[recipe.id];
  if (local) return local;
  if (recipe.image) return { uri: recipe.image };
  return null;
}
