/**
 * Ingredient substitutions — curated swaps matched against the LIVE pantry.
 *
 * When a recipe is missing an ingredient but the pantry holds a good stand-in
 * (no sour cream, but there's Greek yogurt), the Cook surfaces suggest the
 * swap instead of sending the user shopping. Curated data over generation:
 * the table is small, predictable, offline, and trivially tunable — the same
 * philosophy as foodKinds and the shelf-life rules.
 *
 * Matching reuses the cook matcher's normalization (normalizeFoodTokens) so
 * "Reduced-fat sour cream" still hits the "sour cream" entry and a pantry
 * "Plain Greek yogurt" still satisfies the "greek yogurt" substitute.
 * Consistency beats correctness — see cooked.ts.
 *
 * Directionality is deliberate: entries are one-way (yogurt covers sour
 * cream; the reverse swap isn't always wanted). Add the mirror entry when a
 * swap genuinely works both ways.
 *
 * Pure functions, no I/O.
 */

import { normalizeFoodTokens } from './cooked.ts';

/** One curated rule: a recipe ingredient and what can stand in for it. */
export interface SubstitutionRule {
  /** Canonical ingredient phrase, lowercase ("sour cream"). */
  ingredient: string;
  /** Pantry phrases that can stand in, best first. */
  substitutes: string[];
}

/**
 * Seed table — common US-kitchen swaps that don't change the dish. Ordered
 * within each entry from closest match to acceptable fallback.
 */
export const SUBSTITUTION_RULES: SubstitutionRule[] = [
  // Dairy
  { ingredient: 'sour cream', substitutes: ['greek yogurt', 'plain yogurt', 'creme fraiche'] },
  { ingredient: 'greek yogurt', substitutes: ['plain yogurt', 'sour cream'] },
  { ingredient: 'buttermilk', substitutes: ['milk', 'plain yogurt'] },
  { ingredient: 'heavy cream', substitutes: ['half and half', 'whole milk', 'evaporated milk', 'coconut cream'] },
  { ingredient: 'half and half', substitutes: ['whole milk', 'heavy cream'] },
  { ingredient: 'creme fraiche', substitutes: ['sour cream', 'greek yogurt'] },
  { ingredient: 'ricotta', substitutes: ['cottage cheese'] },
  { ingredient: 'mascarpone', substitutes: ['cream cheese'] },
  { ingredient: 'evaporated milk', substitutes: ['heavy cream', 'whole milk'] },

  // Fats & oils
  { ingredient: 'butter', substitutes: ['margarine', 'coconut oil', 'olive oil'] },
  { ingredient: 'vegetable oil', substitutes: ['canola oil', 'olive oil', 'avocado oil', 'coconut oil'] },
  { ingredient: 'canola oil', substitutes: ['vegetable oil', 'olive oil', 'avocado oil'] },
  { ingredient: 'olive oil', substitutes: ['avocado oil', 'vegetable oil', 'canola oil'] },
  { ingredient: 'shortening', substitutes: ['butter', 'coconut oil'] },

  // Acids & condiments
  { ingredient: 'lemon juice', substitutes: ['lime juice', 'vinegar'] },
  { ingredient: 'lime juice', substitutes: ['lemon juice'] },
  { ingredient: 'white wine vinegar', substitutes: ['apple cider vinegar', 'rice vinegar', 'white vinegar'] },
  { ingredient: 'apple cider vinegar', substitutes: ['white wine vinegar', 'rice vinegar', 'lemon juice'] },
  { ingredient: 'rice vinegar', substitutes: ['apple cider vinegar', 'white wine vinegar'] },
  { ingredient: 'dijon mustard', substitutes: ['yellow mustard', 'whole grain mustard'] },
  { ingredient: 'mayonnaise', substitutes: ['greek yogurt', 'sour cream'] },
  { ingredient: 'soy sauce', substitutes: ['tamari', 'coconut aminos', 'worcestershire sauce'] },
  { ingredient: 'worcestershire sauce', substitutes: ['soy sauce'] },
  { ingredient: 'fish sauce', substitutes: ['soy sauce', 'worcestershire sauce'] },
  { ingredient: 'honey', substitutes: ['maple syrup', 'agave', 'sugar'] },
  { ingredient: 'maple syrup', substitutes: ['honey', 'agave'] },

  // Baking
  { ingredient: 'brown sugar', substitutes: ['sugar', 'coconut sugar'] },
  { ingredient: 'powdered sugar', substitutes: ['sugar'] },
  { ingredient: 'cornstarch', substitutes: ['flour', 'arrowroot'] },
  { ingredient: 'baking powder', substitutes: ['baking soda'] },
  { ingredient: 'bread crumbs', substitutes: ['panko', 'crackers', 'oats'] },
  { ingredient: 'panko', substitutes: ['bread crumbs', 'crackers'] },
  { ingredient: 'vanilla extract', substitutes: ['vanilla paste', 'maple syrup'] },

  // Aromatics & produce
  { ingredient: 'shallot', substitutes: ['onion', 'red onion'] },
  { ingredient: 'red onion', substitutes: ['onion', 'shallot'] },
  { ingredient: 'green onion', substitutes: ['chives', 'onion', 'shallot'] },
  { ingredient: 'garlic', substitutes: ['garlic powder'] },
  { ingredient: 'fresh ginger', substitutes: ['ground ginger'] },
  { ingredient: 'cilantro', substitutes: ['parsley'] },
  { ingredient: 'parsley', substitutes: ['cilantro', 'chives'] },
  { ingredient: 'kale', substitutes: ['spinach', 'chard'] },
  { ingredient: 'spinach', substitutes: ['kale', 'chard', 'arugula'] },
  { ingredient: 'zucchini', substitutes: ['yellow squash'] },

  // Stocks & liquids
  { ingredient: 'chicken broth', substitutes: ['chicken stock', 'vegetable broth', 'bouillon'] },
  { ingredient: 'chicken stock', substitutes: ['chicken broth', 'vegetable broth', 'bouillon'] },
  { ingredient: 'beef broth', substitutes: ['beef stock', 'chicken broth', 'bouillon'] },
  { ingredient: 'vegetable broth', substitutes: ['chicken broth', 'bouillon'] },
  { ingredient: 'white wine', substitutes: ['chicken broth', 'apple cider vinegar'] },
  { ingredient: 'red wine', substitutes: ['beef broth', 'grape juice'] },

  // Proteins
  { ingredient: 'chicken breast', substitutes: ['chicken thighs', 'turkey breast'] },
  { ingredient: 'chicken thighs', substitutes: ['chicken breast'] },
  { ingredient: 'ground beef', substitutes: ['ground turkey', 'ground chicken', 'ground pork'] },
  { ingredient: 'ground turkey', substitutes: ['ground chicken', 'ground beef'] },
  { ingredient: 'bacon', substitutes: ['pancetta', 'turkey bacon', 'ham'] },
  { ingredient: 'pancetta', substitutes: ['bacon'] },

  // Grains & starches
  { ingredient: 'rice', substitutes: ['quinoa', 'couscous', 'orzo'] },
  { ingredient: 'quinoa', substitutes: ['rice', 'couscous'] },
  { ingredient: 'couscous', substitutes: ['quinoa', 'rice', 'orzo'] },
];

/** One suggested swap: a missing ingredient the pantry can cover. */
export interface SubstituteSuggestion {
  /** The recipe's missing ingredient, as the API named it. */
  missingIngredient: string;
  /** The pantry item that can stand in. */
  pantryItemId: string;
  pantryItemName: string;
  /** The curated substitute phrase that matched the pantry item. */
  substitute: string;
}

/** True when every token of `phrase` appears in `tokens` (subset match). */
function phraseMatches(phrase: string, tokens: ReadonlySet<string>): boolean {
  const phraseTokens = normalizeFoodTokens(phrase);
  return phraseTokens.length > 0 && phraseTokens.every((t) => tokens.has(t));
}

/**
 * Suggest pantry stand-ins for a recipe's missing ingredients.
 *
 * For each missing ingredient, find the first curated rule whose ingredient
 * phrase is contained in the missing name ("reduced fat sour cream" hits the
 * "sour cream" rule), then the first substitute phrase the pantry can cover
 * (rule order = preference order). At most one suggestion per missing
 * ingredient; misses are simply omitted.
 */
export function suggestSubstitutes(
  missedIngredients: readonly string[],
  pantryItems: ReadonlyArray<{ id: string; name: string }>,
  rules: readonly SubstitutionRule[] = SUBSTITUTION_RULES,
): SubstituteSuggestion[] {
  if (missedIngredients.length === 0 || pantryItems.length === 0) return [];

  const pantry = pantryItems
    .map((item) => ({ item, tokens: new Set(normalizeFoodTokens(item.name)) }))
    .filter((p) => p.tokens.size > 0);
  if (pantry.length === 0) return [];

  const out: SubstituteSuggestion[] = [];
  for (const missing of missedIngredients) {
    const missingTokens = new Set(normalizeFoodTokens(missing));
    if (missingTokens.size === 0) continue;

    const rule = rules.find((r) => phraseMatches(r.ingredient, missingTokens));
    if (!rule) continue;

    let found: SubstituteSuggestion | null = null;
    for (const substitute of rule.substitutes) {
      const hit = pantry.find((p) => phraseMatches(substitute, p.tokens));
      if (hit) {
        found = {
          missingIngredient: missing,
          pantryItemId: hit.item.id,
          pantryItemName: hit.item.name,
          substitute,
        };
        break;
      }
    }
    if (found) out.push(found);
  }
  return out;
}
