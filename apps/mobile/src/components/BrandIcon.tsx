/**
 * BrandIcon — the flat "loaf mark" food family as react-native-svg components.
 *
 * One construction rule shared with the app icon: a solid silhouette, a few
 * cut-marks, and (where natural) one green leaf. Two paint variants:
 *   - onColor : cream silhouette + tone cut-marks  → sits on a COLORED panel
 *   - onLight : tone silhouette  + cream cut-marks  → sits on a CREAM/pale panel
 * The green leaf is constant in both.
 *
 * Decorative — callers hide it from assistive tech; nearby text carries meaning.
 * Pure react-native-svg (already a dep). See brandPalette for the color system.
 */
import Svg, { G } from 'react-native-svg';

import { BRAND_CREAM, BRAND_LEAF, toneHex, type BrandTone } from '../theme/brandPalette';
import { CORE_GLYPHS, type CoreFoodName, type Paint } from './brandGlyphs.core';
import { PANTRY_GLYPHS, PANTRY_TONE, type PantryFoodName } from './brandGlyphs.pantry';

export type BrandFoodName = CoreFoodName | PantryFoodName;

/** Each food's natural ground color (used when a tone isn't given). */
export const FOOD_TONE: Record<BrandFoodName, BrandTone> = {
  bread: 'terracotta', carrot: 'terracotta',
  tomato: 'brick', apple: 'brick',
  lemon: 'ochre', cheese: 'ochre',
  mushroom: 'cocoa', herb: 'cocoa', spoon: 'cocoa',
  pear: 'olive', croissant: 'olive',
  pepper: 'fern',
  fish: 'spruce', bottle: 'spruce',
  egg: 'blue', jar: 'blue',
  grapes: 'plum', cherry: 'plum',
  ...PANTRY_TONE,
};

const GLYPHS = { ...CORE_GLYPHS, ...PANTRY_GLYPHS };

export interface BrandIconProps {
  name: BrandFoodName;
  /** Ground color; defaults to the food's natural tone. */
  tone?: BrandTone;
  /** onColor = cream on a colored panel; onLight = colored on a pale panel. */
  variant?: 'onColor' | 'onLight';
  size?: number;
}

export function BrandIcon({ name, tone, variant = 'onColor', size = 44 }: BrandIconProps) {
  const ground = toneHex(tone ?? FOOD_TONE[name]);
  const paint: Paint =
    variant === 'onColor'
      ? { body: BRAND_CREAM, cut: ground, leaf: BRAND_LEAF }
      : { body: ground, cut: BRAND_CREAM, leaf: BRAND_LEAF };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[name](paint)}
      </G>
    </Svg>
  );
}

/** Stable display order for showcases / ornaments. */
export const BRAND_FOODS: BrandFoodName[] = [
  'bread', 'tomato', 'pear', 'lemon', 'fish', 'grapes', 'egg', 'pepper', 'mushroom',
  'apple', 'croissant', 'cheese', 'bottle', 'jar', 'cherry', 'carrot', 'herb', 'spoon',
];
