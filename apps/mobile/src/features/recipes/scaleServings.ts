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
