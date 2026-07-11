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
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { BRAND_CREAM, BRAND_LEAF, toneHex, type BrandTone } from '../theme/brandPalette';

export type BrandFoodName =
  | 'bread' | 'apple' | 'pear' | 'tomato' | 'carrot' | 'mushroom' | 'croissant'
  | 'fish' | 'egg' | 'herb' | 'grapes' | 'cheese' | 'jar' | 'bottle' | 'cherry'
  | 'lemon' | 'pepper' | 'spoon';

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
};

interface Paint {
  body: string;
  cut: string;
  leaf: string;
}

const GLYPHS: Record<BrandFoodName, (c: Paint) => React.ReactNode> = {
  bread: ({ body, cut, leaf }) => (
    <>
      <Path d="M14 36 L14 24 A10 10 0 0 1 34 24 L34 36 Z" fill={body} />
      <Path d="M22 22 l-4 7" fill="none" stroke={cut} />
      <Path d="M30 22 l-4 7" fill="none" stroke={cut} />
      <Path d="M24 6 C27.5 9 27.5 13.5 24 16 C20.5 13.5 20.5 9 24 6 Z" fill={leaf} />
    </>
  ),
  apple: ({ body, cut, leaf }) => (
    <>
      <Path d="M24 17 C19 13 13 16 13 24 C13 32 19 36 24 34 C29 36 35 32 35 24 C35 16 29 13 24 17 Z" fill={body} />
      <Path d="M19 22 l-2 5" fill="none" stroke={cut} />
      <Path d="M24 16 V13" fill="none" stroke={leaf} />
      <Path d="M25 15 C29 11 34 12 34 12 C34 16 30 18 26 17 Z" fill={leaf} />
    </>
  ),
  pear: ({ body, cut, leaf }) => (
    <>
      <Path d="M24 15 C26 15 26.5 18 26.5 20 C31 22 33 28 30 33 C28 37 20 37 18 33 C15 28 17.5 22 21.5 20 C21.5 18 22 15 24 15 Z" fill={body} />
      <Path d="M21 26 l-1.5 4" fill="none" stroke={cut} />
      <Path d="M25 15 C28 12 32 13 32 13 C32 16 29 18 26 17 Z" fill={leaf} />
    </>
  ),
  tomato: ({ body, leaf }) => (
    <>
      <Circle cx={24} cy={30} r={11} fill={body} />
      <Path d="M24 21 L24 14 L27 18 Z" fill={leaf} />
      <Path d="M24 21 L18 15 L20 20 Z" fill={leaf} />
      <Path d="M24 21 L30 15 L28 20 Z" fill={leaf} />
    </>
  ),
  carrot: ({ body, cut, leaf }) => (
    <>
      <Path d="M24 39 L19 21 Q24 18 29 21 Z" fill={body} />
      <Path d="M22 27 l3 1" fill="none" stroke={cut} />
      <Path d="M23 31 l3 1" fill="none" stroke={cut} />
      <Path d="M24 21 V13 M24 16 L18 11 M24 16 L30 11" fill="none" stroke={leaf} />
    </>
  ),
  mushroom: ({ body, cut }) => (
    <>
      <Path d="M20 28 Q20 38 22 40 h4 Q28 38 28 28 Z" fill={body} />
      <Path d="M11 26 Q11 15 24 15 Q37 15 37 26 Q30 29 24 29 Q18 29 11 26 Z" fill={body} />
      <Circle cx={20} cy={21} r={1.7} fill={cut} />
      <Circle cx={28} cy={22} r={1.4} fill={cut} />
      <Circle cx={24} cy={19} r={1.2} fill={cut} />
    </>
  ),
  croissant: ({ body, cut }) => (
    <>
      <Path d="M11 33 C11 21 37 21 37 33 C30 28 18 28 11 33 Z" fill={body} />
      <Path d="M19 27 v4" fill="none" stroke={cut} />
      <Path d="M24 26 v5" fill="none" stroke={cut} />
      <Path d="M29 27 v4" fill="none" stroke={cut} />
    </>
  ),
  fish: ({ body, cut }) => (
    <>
      <Path d="M12 24 C16 16 30 16 34 24 C30 32 16 32 12 24 Z" fill={body} />
      <Path d="M33 24 L40 19 L40 29 Z" fill={body} />
      <Circle cx={18} cy={23} r={1.6} fill={cut} />
      <Path d="M28 20 q2 4 0 8" fill="none" stroke={cut} />
    </>
  ),
  egg: ({ body, cut }) => (
    <>
      <Path d="M15 25 Q13 17 21 16 Q25 12 30 17 Q38 18 36 26 Q39 32 31 33 Q27 38 21 34 Q14 34 15 25 Z" fill={body} />
      <Circle cx={24} cy={25} r={4} fill={cut} />
    </>
  ),
  herb: ({ leaf }) => (
    <>
      <Path d="M24 40 V18" fill="none" stroke={leaf} />
      <Path d="M24 28 C17 26 15 19 15 19 C21 19 24 24 24 28 Z" fill={leaf} />
      <Path d="M24 24 C31 22 33 15 33 15 C27 15 24 20 24 24 Z" fill={leaf} />
    </>
  ),
  grapes: ({ body, leaf }) => (
    <>
      <Circle cx={24} cy={20} r={4} fill={body} />
      <Circle cx={19} cy={26} r={4} fill={body} />
      <Circle cx={29} cy={26} r={4} fill={body} />
      <Circle cx={24} cy={27} r={4} fill={body} />
      <Circle cx={21} cy={33} r={4} fill={body} />
      <Circle cx={27} cy={33} r={4} fill={body} />
      <Circle cx={24} cy={38} r={4} fill={body} />
      <Path d="M25 16 C29 12 34 13 34 13 C34 17 30 19 26 18 Z" fill={leaf} />
    </>
  ),
  cheese: ({ body, cut }) => (
    <>
      <Path d="M11 31 L34 20 Q37 19 37 22 L37 30 Q37 32 34 31 Z" fill={body} />
      <Circle cx={26} cy={26} r={1.8} fill={cut} />
      <Circle cx={20} cy={29} r={1.4} fill={cut} />
      <Circle cx={31} cy={27} r={1.1} fill={cut} />
    </>
  ),
  jar: ({ body, cut, leaf }) => (
    <>
      <Path d="M17 21 h14 v17 a2 2 0 0 1 -2 2 h-10 a2 2 0 0 1 -2 -2 Z" fill={body} />
      <Path d="M15 16 h18 v5 h-18 Z" fill={leaf} />
      <Path d="M21 30 h6" fill="none" stroke={cut} />
    </>
  ),
  bottle: ({ body, leaf }) => (
    <>
      <Path d="M20 16 h8 v4 l3 5 v15 a2 2 0 0 1 -2 2 h-10 a2 2 0 0 1 -2 -2 v-15 l3 -5 Z" fill={body} />
      <Path d="M24 15 V12" fill="none" stroke={leaf} />
      <Path d="M24 12 C27 9 31 10 31 10 C31 13 28 15 25 14 Z" fill={leaf} />
    </>
  ),
  cherry: ({ body, leaf }) => (
    <>
      <Circle cx={19} cy={34} r={5} fill={body} />
      <Circle cx={30} cy={34} r={5} fill={body} />
      <Path d="M19 29 C21 22 27 18 30 29" fill="none" stroke={leaf} />
      <Path d="M26 21 C30 18 34 20 34 20 C33 24 29 25 26 23 Z" fill={leaf} />
    </>
  ),
  lemon: ({ body, cut, leaf }) => (
    <>
      <Ellipse cx={24} cy={28} rx={12} ry={9} fill={body} />
      <Path d="M33 28 h3" fill="none" stroke={cut} />
      <Path d="M12 20 C8 17 4 19 4 19 C5 23 9 24 13 22 Z" fill={leaf} />
    </>
  ),
  pepper: ({ body, leaf }) => (
    <>
      <Path d="M17 22 Q17 38 27 40 Q35 39 33 30 Q30 24 27 22 Z" fill={body} />
      <Path d="M25 22 Q23 16 27 14" fill="none" stroke={leaf} />
    </>
  ),
  spoon: ({ body }) => (
    <>
      <Ellipse cx={24} cy={17} rx={6.5} ry={8.5} fill={body} />
      <Path d="M22 24 h4 v15 a2 2 0 0 1 -4 0 Z" fill={body} />
    </>
  ),
};

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
