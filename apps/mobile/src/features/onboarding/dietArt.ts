/**
 * dietArt — diet/allergy slug → loaf-mark glyph for the onboarding DietStep.
 * One glyph per slug across the whole screen (test-enforced); reuse against
 * OTHER screens (staples picker) is fine — the no-sharing rule is per-grid.
 */
import type { BrandFoodName } from '../../components/BrandIcon';

export const DIET_ART: Record<string, BrandFoodName> = {
  vegetarian: 'carrot',
  vegan: 'herb',
  'gluten-free': 'wheat',
  'dairy-free': 'milkjug',
  'nut-free': 'peanut',
};

export const ALLERGY_ART: Record<string, BrandFoodName> = {
  egg: 'egg',
  soy: 'soybottle',
  fish: 'fish',
  shellfish: 'shrimp',
};
