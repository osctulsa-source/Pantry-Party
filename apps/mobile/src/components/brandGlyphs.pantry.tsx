/**
 * brandGlyphs.pantry — staple-picker glyphs (one per staple, no sharing).
 * Same construction rule as the core family: solid `body` silhouette, 2–3
 * `cut` marks, `leaf` only where botanically natural. Marks OUTSIDE the
 * silhouette (steam, handles, strings) use `body` — `cut` is the panel color.
 */
import { Circle, Path, Rect } from 'react-native-svg';

import type { BrandTone } from '../theme/brandPalette';
import type { Paint } from './brandGlyphs.core';

export type PantryFoodName =
  | 'floursack' | 'sugarbowl' | 'sugarbag' | 'sodabox' | 'powdertin' | 'saltshaker' | 'yeastpacket';

export const PANTRY_GLYPHS: Record<PantryFoodName, (c: Paint) => React.ReactNode> = {
  // Rolled-top flour sack, stitch marks.
  floursack: ({ body, cut }) => (
    <>
      <Path d="M14 40 L14 24 Q14 18 19 17 L29 17 Q34 18 34 24 L34 40 Z" fill={body} />
      <Path d="M18 17 L30 17 L28 11 L20 11 Z" fill={body} />
      <Path d="M20 28 h8" fill="none" stroke={cut} />
      <Path d="M20 33 h8" fill="none" stroke={cut} />
    </>
  ),
  // Lidded sugar bowl, knob, cube alongside.
  sugarbowl: ({ body, cut }) => (
    <>
      <Path d="M13 27 Q13 38 24 38 Q35 38 35 27 Z" fill={body} />
      <Path d="M14 27 Q14 20 24 20 Q34 20 34 27 Z" fill={body} />
      <Circle cx={24} cy={17} r={2.5} fill={body} />
      <Path d="M16 27 h16" fill="none" stroke={cut} />
      <Rect x={35} y={33} width={5} height={5} rx={1} fill={body} />
    </>
  ),
  // Soft brown-sugar bag with a folded top and grain specks.
  sugarbag: ({ body, cut }) => (
    <>
      <Path d="M16 40 Q13 30 17 21 L21 15 H27 L31 21 Q35 30 32 40 Z" fill={body} />
      <Path d="M21 15 L24 20 L27 15" fill="none" stroke={cut} />
      <Circle cx={21} cy={30} r={1.3} fill={cut} />
      <Circle cx={26} cy={33} r={1.3} fill={cut} />
      <Circle cx={23} cy={36} r={1.1} fill={cut} />
    </>
  ),
  // Upright baking-soda box with open flaps and a band.
  sodabox: ({ body, cut }) => (
    <>
      <Rect x={16} y={16} width={16} height={24} rx={2} fill={body} />
      <Path d="M16 16 L20 10 H28 L32 16 Z" fill={body} />
      <Path d="M16 26 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={33} r={2} fill={cut} />
    </>
  ),
  // Squat round baking-powder tin with a lid lip.
  powdertin: ({ body, cut }) => (
    <>
      <Rect x={15} y={20} width={18} height={18} rx={3} fill={body} />
      <Rect x={13} y={15} width={22} height={7} rx={3} fill={body} />
      <Path d="M19 30 h10" fill="none" stroke={cut} />
    </>
  ),
  // Domed salt shaker, three pour holes, waist line.
  saltshaker: ({ body, cut }) => (
    <>
      <Path d="M17 22 Q17 12 24 12 Q31 12 31 22 L31 36 Q31 40 27 40 H21 Q17 40 17 36 Z" fill={body} />
      <Circle cx={21} cy={17} r={1.2} fill={cut} />
      <Circle cx={27} cy={17} r={1.2} fill={cut} />
      <Circle cx={24} cy={14.5} r={1.2} fill={cut} />
      <Path d="M17 24 h14" fill="none" stroke={cut} />
    </>
  ),
  // Yeast sachet with a serration line and grain dots.
  yeastpacket: ({ body, cut }) => (
    <>
      <Rect x={15} y={15} width={18} height={24} rx={2} fill={body} />
      <Path d="M15 20 h18" fill="none" stroke={cut} />
      <Circle cx={20} cy={29} r={1.2} fill={cut} />
      <Circle cx={25} cy={32} r={1.2} fill={cut} />
      <Circle cx={28} cy={27} r={1.2} fill={cut} />
    </>
  ),
};

/** Natural ground per pantry glyph — merged into BrandIcon's FOOD_TONE. */
export const PANTRY_TONE: Record<PantryFoodName, BrandTone> = {
  floursack: 'ochre', sugarbowl: 'blue', sugarbag: 'cocoa', sodabox: 'spruce',
  powdertin: 'terracotta', saltshaker: 'blue', yeastpacket: 'ochre',
} as const;
