/**
 * brandGlyphs.micro — glyphs for the micro-animations kit, same construction
 * rule as brandGlyphs.core: solid `body` silhouette, `cut` marks, `leaf` only
 * where natural (unused here — none of these are botanicals).
 */
import { Circle, Path, Rect } from 'react-native-svg';

import type { BrandTone } from '../theme/brandPalette';
import type { Paint } from './brandGlyphs.core';

export type MicroGlyphName = 'plate' | 'flame' | 'receipt' | 'fridge';

export const MICRO_TONE: Record<MicroGlyphName, BrandTone> = {
  plate: 'terracotta',
  flame: 'terracotta',
  receipt: 'fern',
  fridge: 'fern',
};

export const MICRO_GLYPHS: Record<MicroGlyphName, (c: Paint) => React.ReactNode> = {
  // Clean plate: rim + inner ring + three sparkle ticks (cut color).
  plate: ({ body, cut }) => (
    <>
      <Circle cx={24} cy={26} r={14} fill={body} />
      <Circle cx={24} cy={26} r={8} fill={cut} />
      <Path d="M11 12 h6 M14 9 v6" fill="none" stroke={cut} />
      <Path d="M33 10 h5 M35.5 7.5 v5" fill="none" stroke={cut} />
      <Path d="M36 22 h4 M38 20 v4" fill="none" stroke={cut} />
    </>
  ),
  // Simple flame: outer teardrop body, inner teardrop cut.
  flame: ({ body, cut }) => (
    <>
      <Path d="M24 10 C30 18 30 24 24 30 C18 24 18 18 24 10 Z" fill={body} />
      <Path d="M24 18 C27 22 27 25 24 28 C21 25 21 22 24 18 Z" fill={cut} />
    </>
  ),
  // Receipt: torn bottom edge, three text-line cut marks.
  receipt: ({ body, cut }) => (
    <>
      <Path d="M14 8 h20 v32 l-3 -3 -3 3 -3 -3 -3 3 -3 -3 -3 3 -2 -3 Z" fill={body} />
      <Path d="M18 16 h12 M18 22 h12 M18 28 h8" fill="none" stroke={cut} />
    </>
  ),
  // Fridge: body, freezer divider line, two handle marks.
  fridge: ({ body, cut }) => (
    <>
      <Path d="M14 8 h20 v32 a2 2 0 0 1 -2 2 h-16 a2 2 0 0 1 -2 -2 Z" fill={body} />
      <Path d="M14 20 h20" fill="none" stroke={cut} />
      <Rect x={29} y={11} width={2} height={5} rx={1} fill={cut} />
      <Rect x={29} y={23} width={2} height={5} rx={1} fill={cut} />
    </>
  ),
};
