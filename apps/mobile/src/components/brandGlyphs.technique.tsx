/**
 * brandGlyphs.technique — animated technique + stage glyphs for Cook Mode.
 * Same construction rules as the loaf-mark family (solid silhouette, cream
 * cut-marks, stroke 3, leaf where natural), but scenes are multi-tone, so
 * colors are baked per glyph from brandPalette instead of taking a Paint.
 * Each glyph = a static `base` plus named animatable `layers`; motion lives
 * in techniqueMotion.ts, rendering in TechniqueGlyph.tsx.
 */
import type { ReactNode } from 'react';

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
