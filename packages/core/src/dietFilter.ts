/**
 * Diet & allergy filtering — the "applied elsewhere" step tasteProfile.ts
 * promised. Pure functions, no I/O (pattern: useItUp.ts, cookingDevice.ts).
 *
 * Two mechanisms:
 *  - Flag-backed diets (vegetarian / vegan / gluten-free): the recipe's
 *    boolean must be strictly true — unknown hides, the safe direction for a
 *    hard dietary line.
 *  - Keyword-backed lines (dairy-free / nut-free + the allergens): a
 *    conservative deny-list substring match over lowercased ingredient names.
 *    Keywords are word-ish on purpose ("almond", never bare "nut") so nutmeg
 *    and butternut squash don't false-positive. Over-hides (eggplant on an
 *    egg allergy) are accepted — hiding too much beats showing an allergen.
 *
 * Vegan additionally backstops the dairy + egg keyword lists — a recipe whose
 * vegan flag lies about cream still gets hidden.
 */
import type { TasteProfile } from "./tasteProfile.ts";

export interface DietCheckRecipe {
  vegetarian?: boolean | null;
  vegan?: boolean | null;
  glutenFree?: boolean | null;
  /** Lowercased ingredient names (caller maps from its recipe shape). */
  ingredientNames: string[];
}

export const DAIRY_KEYWORDS = [
  "milk", "butter", "cheese", "cream", "yogurt", "ghee",
  "mozzarella", "parmesan", "cheddar", "feta", "ricotta",
] as const;

export const NUT_KEYWORDS = [
  "peanut", "almond", "cashew", "walnut", "pecan", "pistachio",
  "hazelnut", "macadamia", "nut butter",
] as const;

export const EGG_KEYWORDS = ["egg", "mayonnaise", "mayo", "aioli"] as const;

export const SOY_KEYWORDS = ["soy", "tofu", "edamame", "tempeh", "miso", "tamari"] as const;

export const FISH_KEYWORDS = [
  "fish", "salmon", "tuna", "cod", "tilapia", "anchov", "sardine", "halibut", "trout",
] as const;

export const SHELLFISH_KEYWORDS = [
  "shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel", "oyster",
] as const;

/** True when the profile has no dietary lines at all — callers skip filtering entirely. */
export function hasDietLines(profile: TasteProfile): boolean {
  return profile.diets.length > 0 || profile.allergies.length > 0;
}

function hitsKeywords(names: string[], keywords: readonly string[]): boolean {
  return names.some((raw) => {
    const n = raw.toLowerCase();
    return keywords.some((k) => n.includes(k));
  });
}

/** Slugs from profile.diets + profile.allergies the recipe violates. */
export function recipeViolations(profile: TasteProfile, recipe: DietCheckRecipe): string[] {
  const violated: string[] = [];
  const names = recipe.ingredientNames;

  for (const diet of profile.diets) {
    if (diet === "vegetarian" && recipe.vegetarian !== true) violated.push(diet);
    else if (diet === "vegan" && (recipe.vegan !== true || hitsKeywords(names, DAIRY_KEYWORDS) || hitsKeywords(names, EGG_KEYWORDS))) violated.push(diet);
    else if (diet === "gluten-free" && recipe.glutenFree !== true) violated.push(diet);
    else if (diet === "dairy-free" && hitsKeywords(names, DAIRY_KEYWORDS)) violated.push(diet);
    else if (diet === "nut-free" && hitsKeywords(names, NUT_KEYWORDS)) violated.push(diet);
  }

  for (const allergy of profile.allergies) {
    if (allergy === "egg" && hitsKeywords(names, EGG_KEYWORDS)) violated.push(allergy);
    else if (allergy === "soy" && hitsKeywords(names, SOY_KEYWORDS)) violated.push(allergy);
    else if (allergy === "fish" && hitsKeywords(names, FISH_KEYWORDS)) violated.push(allergy);
    else if (allergy === "shellfish" && hitsKeywords(names, SHELLFISH_KEYWORDS)) violated.push(allergy);
  }

  return violated;
}

/** True when the recipe violates nothing. */
export function passesDiet(profile: TasteProfile, recipe: DietCheckRecipe): boolean {
  return recipeViolations(profile, recipe).length === 0;
}
