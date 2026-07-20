/**
 * Pure servings-scaling helpers for recipe ingredients. No React, no
 * side effects — safe to unit test directly and share between
 * RecipeDetailScreen (ingredient list) and CookModeView (via
 * effectiveRecipe, which already reads recipe.ingredients as-is).
 */
import type { RecipeIngredient } from '../../data/spoonacular/types';

const FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.67, '⅔'],
  [0.75, '¾'],
];

/**
 * A friendly amount string — "1½ cups", "2 tbsp", "¾" — so the food name can
 * lead the row and the fractions stay glanceable off to the side. Decimal
 * fractions map to the familiar unicode glyphs; null when there's no amount.
 */
export function formatAmount(amount: number | null, unit: string): string | null {
  if (amount === null || amount <= 0) return unit.trim() || null;
  const whole = Math.floor(amount);
  const frac = amount - whole;
  let fracGlyph = '';
  for (const [v, glyph] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.05) {
      fracGlyph = glyph;
      break;
    }
  }
  const num = fracGlyph
    ? whole > 0
      ? `${whole}${fracGlyph}`
      : fracGlyph
    : Number.isInteger(amount)
      ? `${amount}`
      : `${Math.round(amount * 100) / 100}`;
  const u = unit.trim();
  return u ? `${num} ${u}` : num;
}

/** Nearest-quarter snap used for scaled amounts, matching the fraction glyphs above. */
function snapToQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

// Matches a leading numeric/fraction token at the start of an `original`
// string: digits, decimal points, a slash (for "1/2"), unicode fraction
// glyphs, and the whitespace that follows — e.g. "1 lb", "1½ cups", "¾ cup".
const LEADING_NUMBER = /^[\d.\/½⅓⅔¼¾]+\s*/;

/** Strips a leading unit token (matching `unit`, tolerating a trailing "s") from the front of `text`. */
function stripLeadingUnit(text: string, unit: string): string {
  const u = unit.trim();
  if (!u) return text;
  const match = new RegExp(`^${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\s*`, 'i').exec(text);
  return match !== null ? text.slice(match[0].length) : text;
}

/**
 * Scales a recipe's ingredient list from one serving count to another.
 * Returns the same array reference (identity) when there's nothing to do,
 * so callers can memoize on the result safely.
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromServings: number,
  toServings: number,
): RecipeIngredient[] {
  if (fromServings <= 0 || fromServings === toServings) return ingredients;
  const ratio = toServings / fromServings;

  return ingredients.map((ing) => {
    if (ing.amount === null) return ing;

    const rawScaled = ing.amount * ratio;
    const snapped = snapToQuarter(rawScaled);
    const newAmount = snapped > 0 ? snapped : 0.25;

    const formatted = formatAmount(newAmount, ing.unit);
    const leadingMatch = LEADING_NUMBER.exec(ing.original);
    const newOriginal =
      leadingMatch !== null
        ? `${formatted ?? ''} ${stripLeadingUnit(ing.original.slice(leadingMatch[0].length), ing.unit)}`.trim()
        : `${formatted ?? ''} ${ing.name}`.trim();

    return { ...ing, amount: newAmount, original: newOriginal };
  });
}
