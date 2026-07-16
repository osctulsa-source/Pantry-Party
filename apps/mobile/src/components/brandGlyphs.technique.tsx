/**
 * brandGlyphs.technique — animated technique + stage glyphs for Cook Mode.
 * Same construction rules as the loaf-mark family (solid silhouette, cream
 * cut-marks, stroke 3, leaf where natural), but scenes are multi-tone, so
 * colors are baked per glyph from brandPalette instead of taking a Paint.
 * Each glyph = a static `base` plus named animatable `layers`; motion lives
 * in techniqueMotion.ts, rendering in TechniqueGlyph.tsx.
 */
import type { ReactNode } from 'react';
import { Circle, Ellipse, Path } from 'react-native-svg';

import { BRAND_CREAM, BRAND_LEAF, toneHex } from '../theme/brandPalette';

export const TECHNIQUES = [
  'chop', 'stir', 'simmer', 'flip', 'knead', 'season',
  'pour', 'grate', 'roll', 'rest', 'preheat', 'mash',
] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const STAGES = ['prep', 'cooking', 'finishing'] as const;
export type Stage = (typeof STAGES)[number];

/** Every id TechniqueGlyph can render. */
export type TechniqueGlyphName = Technique | Stage;

export interface GlyphLayer {
  /** Referenced by the motion spec — must be unique within the glyph. */
  id: string;
  node: () => ReactNode;
}

export interface TechniqueGlyphDef {
  base: () => ReactNode;
  /** Render order: earlier layers sit BEHIND later ones. */
  layers: GlyphLayer[];
}

const CREAM = BRAND_CREAM;
const LEAF = BRAND_LEAF;
/** Neutral warm gray for steam/heat wisps — the one non-palette color this family needs. */
const STEAM = '#8B8474';
const TERRA = toneHex('terracotta');
const BRICK = toneHex('brick');
const OCHRE = toneHex('ochre');
const COCOA = toneHex('cocoa');
const OLIVE = toneHex('olive');
const SPRUCE = toneHex('spruce');
const BLUE = toneHex('blue');
const PLUM = toneHex('plum');

// Stroke-weight convention (deliberate, per the approved motion mockups — not
// drift from BrandIcon's uniform 3): cream cut-marks are 2 (as in the loaf-mark
// family); delicate lines (steam wisps, heat waves, leaf fronds) are 2.2–2.4 so
// they read as vapor/foliage; solid utensil handles DRAWN as strokes (spoon,
// pan, pin, masher) are 3.4–3.6 so they carry silhouette weight. Everything
// unmarked inherits 3 from TechniqueGlyph's wrapping <G>.
export const TECHNIQUE_GLYPHS: Record<TechniqueGlyphName, TechniqueGlyphDef> = {
  // -------- techniques (12) --------
  chop: {
    base: () => (
      <>
        <Path d="M13 36 Q13 32.5 16.5 32.5 L34 33.5 Q36 34.5 36 36 Q36 38.5 33 39 L16.5 39.5 Q13 39.5 13 36 Z" fill={TERRA} />
        <Path d="M22 33.5 l0.5 5" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M28 34 l0.5 4.5" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M13 36 L7 32 M13 36 L6 36 M13 36 L7 40" stroke={LEAF} fill="none" strokeWidth={2.4} />
        <Ellipse cx={40.5} cy={37.5} rx={2} ry={3} fill={TERRA} />
        <Ellipse cx={44.5} cy={38} rx={2} ry={3} fill={TERRA} />
      </>
    ),
    layers: [
      {
        id: 'knife',
        node: () => (
          <>
            <Path d="M10 22 L30 22 Q34 22 34 18.5 L34 17 L10 17 Q7 19.5 10 22 Z" fill={COCOA} />
            <Path d="M34 19.5 L44 19.5 Q45.5 17.5 44 15.5 L36 15.5 Z" fill={COCOA} />
            <Path d="M15 19.5 h12" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  stir: {
    base: () => (
      <>
        <Path d="M8 26 L40 26 Q40 41 24 41 Q8 41 8 26 Z" fill={BLUE} />
        <Path d="M13 31 Q24 34 35 31" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M43 24 C46 21 45 17 45 17 C42 17 40 20 41 23 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [
      {
        id: 'spoon',
        node: () => (
          <>
            <Path d="M27 6 L23.5 24" stroke={COCOA} fill="none" strokeWidth={3.4} />
            <Ellipse cx={23} cy={27} rx={4} ry={5} fill={COCOA} />
          </>
        ),
      },
    ],
  },

  simmer: {
    base: () => (
      <>
        <Path d="M11 24 L37 24 L36 38 Q36 41 32 41 L16 41 Q12 41 12 38 Z" fill={SPRUCE} />
        <Path d="M17 29 l1 7" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M8 25 L11 25 M37 25 L40 25" stroke={SPRUCE} fill="none" strokeWidth={3.4} />
      </>
    ),
    layers: [
      { id: 'wisp1', node: () => <Path d="M17 16 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
      { id: 'wisp2', node: () => <Path d="M24 15 q2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
      { id: 'wisp3', node: () => <Path d="M31 16 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
      {
        id: 'lid',
        node: () => (
          <>
            <Path d="M11 22 Q11 18 24 18 Q37 18 37 22 Z" fill={SPRUCE} />
            <Path d="M22 15.5 h4" stroke={SPRUCE} fill="none" strokeWidth={3.4} />
          </>
        ),
      },
    ],
  },

  flip: {
    base: () => null,
    layers: [
      {
        id: 'pancake',
        node: () => (
          <>
            <Ellipse cx={21} cy={27} rx={8} ry={3.4} fill={OCHRE} />
            <Path d="M16 26 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
      {
        id: 'pan',
        node: () => (
          <>
            <Path d="M8 31 L34 31 Q34 37 28 37 L14 37 Q8 37 8 31 Z" fill={COCOA} />
            <Path d="M34 32.5 L44 30.5" stroke={COCOA} fill="none" strokeWidth={3.6} />
            <Path d="M13 34 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  knead: {
    base: () => <Path d="M6 39 L42 39" stroke={COCOA} fill="none" strokeWidth={3.4} />,
    layers: [
      {
        id: 'dough',
        node: () => (
          <>
            <Path d="M12 36 Q12 22 24 22 Q36 22 36 36 Z" fill={OCHRE} />
            <Path d="M19 28 l-2 5" stroke={CREAM} fill="none" strokeWidth={2} />
            <Path d="M27 28 l-2 5" stroke={CREAM} fill="none" strokeWidth={2} />
            <Path d="M24 21 C27 18 31 19 31 19 C31 22 28 24 25 23 Z" fill={LEAF} stroke="none" />
          </>
        ),
      },
    ],
  },

  season: {
    base: () => (
      <>
        <Path d="M10 38 L38 38 Q38 43 32 43 L16 43 Q10 43 10 38 Z" fill={BRICK} />
        <Path d="M16 40.5 h6" stroke={CREAM} fill="none" strokeWidth={2} />
      </>
    ),
    layers: [
      { id: 'flake1', node: () => <Circle cx={28} cy={21} r={1.6} fill={OLIVE} stroke="none" /> },
      { id: 'flake2', node: () => <Circle cx={24} cy={23} r={1.4} fill={OLIVE} stroke="none" /> },
      { id: 'flake3', node: () => <Circle cx={31} cy={24} r={1.3} fill={OLIVE} stroke="none" /> },
      {
        id: 'jar',
        node: () => (
          <>
            <Path d="M27 8 Q27 6 29 6 L37 6 Q39 6 39 8 L39 16 Q39 18 37 18 L29 18 Q27 18 27 16 Z" fill={OLIVE} />
            <Path d="M30 10 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  pour: {
    base: () => (
      <>
        <Path d="M12 32 L36 32 Q36 42 24 42 Q12 42 12 32 Z" fill={OCHRE} />
        <Path d="M17 35 Q24 37.5 31 35" stroke={CREAM} fill="none" strokeWidth={2} />
      </>
    ),
    layers: [
      { id: 'drop1', node: () => <Circle cx={26} cy={18} r={1.6} fill={BLUE} stroke="none" /> },
      { id: 'drop2', node: () => <Circle cx={24.5} cy={21} r={1.4} fill={BLUE} stroke="none" /> },
      {
        id: 'jug',
        node: () => (
          <>
            <Path d="M8 7 Q8 5.5 9.5 5.5 L20 5.5 Q21.5 5.5 21.5 7 L21.5 15 Q21.5 16.5 20 16.5 L9.5 16.5 Q8 16.5 8 15 Z" fill={BLUE} />
            <Path d="M21.5 8 L25 10 L21.5 12 Z" fill={BLUE} />
            <Path d="M11 9 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  grate: {
    base: () => (
      <>
        <Path d="M18 14 L30 14 L33 40 L15 40 Z" fill={SPRUCE} />
        <Path d="M21 20 l0.6 4 M26 20 l0.6 4 M22 28 l0.6 4 M27 28 l0.6 4" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M20 14 Q20 9 24 9 Q28 9 28 14" stroke={SPRUCE} fill="none" strokeWidth={3} />
      </>
    ),
    layers: [
      {
        id: 'food',
        node: () => (
          <>
            <Path d="M31 8 Q31 6.5 32.5 6.5 L39 6.5 Q40.5 6.5 40.5 8 L40.5 12 Q40.5 13.5 39 13.5 L32.5 13.5 Q31 13.5 31 12 Z" fill={OCHRE} />
            <Path d="M34 9 h4" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  roll: {
    base: () => (
      <>
        <Path d="M6 41 L42 41" stroke={COCOA} fill="none" strokeWidth={3.4} />
        <Ellipse cx={24} cy={36} rx={14} ry={4} fill={OCHRE} />
        <Path d="M18 35.5 h5" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M40 32 C43 29 42 25 42 25 C39 25 37 28 38 31 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [
      {
        id: 'pin',
        node: () => (
          <>
            <Path d="M13 22 Q10 22 10 25 Q10 28 13 28 L35 28 Q38 28 38 25 Q38 22 35 22 Z" fill={COCOA} />
            <Path d="M4 25 L10 25 M38 25 L44 25" stroke={COCOA} fill="none" strokeWidth={3.4} />
            <Path d="M17 25 h8" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  rest: {
    base: () => (
      <>
        <Path d="M10 26 L38 26 Q38 40 24 40 Q10 40 10 26 Z" fill={PLUM} />
        <Path d="M15 30 Q24 33 33 30" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M41 24 C44 21 43 17 43 17 C40 17 38 20 39 23 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [
      { id: 'wisp', node: () => <Path d="M24 21 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
    ],
  },

  preheat: {
    base: () => (
      <>
        <Path d="M10 12 Q10 9 13 9 L35 9 Q38 9 38 12 L38 38 Q38 41 35 41 L13 41 Q10 41 10 38 Z" fill={BRICK} />
        <Circle cx={17} cy={13.5} r={1.5} fill={CREAM} stroke="none" />
        <Circle cx={23} cy={13.5} r={1.5} fill={CREAM} stroke="none" />
        <Path d="M15 20 L33 20 L33 34 L15 34 Z" fill={CREAM} stroke="none" />
      </>
    ),
    layers: [
      { id: 'wave1', node: () => <Path d="M21 31 q-1.5 -3 0 -6" stroke={BRICK} fill="none" strokeWidth={2.2} /> },
      { id: 'wave2', node: () => <Path d="M27 31 q1.5 -3 0 -6" stroke={BRICK} fill="none" strokeWidth={2.2} /> },
    ],
  },

  mash: {
    base: () => (
      <>
        <Path d="M12 28 L36 28 L35 40 Q35 42 32 42 L16 42 Q13 42 13 40 Z" fill={SPRUCE} />
        <Path d="M18 32 l1 6" stroke={CREAM} fill="none" strokeWidth={2} />
      </>
    ),
    layers: [
      {
        id: 'masher',
        node: () => (
          <>
            <Path d="M24 6 L24 18" stroke={COCOA} fill="none" strokeWidth={3.4} />
            <Path d="M16 20 L32 20" stroke={COCOA} fill="none" strokeWidth={3} />
            <Path d="M17 20 v5 M21 20 v5 M25 20 v5 M29 20 v5" stroke={COCOA} fill="none" strokeWidth={2.4} />
          </>
        ),
      },
    ],
  },

  // -------- stage fallbacks (3) --------
  prep: {
    base: () => (
      <>
        <Path d="M8 31 Q8 28 11 28 L37 28 Q40 28 40 31 Q40 34 37 34 L11 34 Q8 34 8 31 Z" fill={COCOA} />
        <Circle cx={18} cy={22} r={5} fill={BRICK} />
        <Path d="M18 17 L18 14 L20.5 16 Z" fill={LEAF} stroke="none" />
        <Path d="M30 26 v-8 M30 21 l-4 -3 M30 21 l4 -3" stroke={LEAF} fill="none" strokeWidth={2.4} />
      </>
    ),
    layers: [],
  },

  cooking: {
    base: () => (
      <>
        <Path d="M11 22 L37 22 L36 38 Q36 41 32 41 L16 41 Q12 41 12 38 Z" fill={SPRUCE} />
        <Path d="M17 27 l1 8" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M8 23 L11 23 M37 23 L40 23" stroke={SPRUCE} fill="none" strokeWidth={3.4} />
      </>
    ),
    layers: [
      { id: 'wisp', node: () => <Path d="M24 18 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
    ],
  },

  finishing: {
    base: () => (
      <>
        <Ellipse cx={24} cy={34} rx={15} ry={5} fill={BRICK} />
        <Ellipse cx={24} cy={33.5} rx={10} ry={3} fill={CREAM} stroke="none" />
        <Ellipse cx={24} cy={30} rx={7} ry={3.6} fill={OLIVE} />
        <Path d="M25 26 C28 23 32 24 32 24 C32 27 29 29 26 28 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [],
  },
};
