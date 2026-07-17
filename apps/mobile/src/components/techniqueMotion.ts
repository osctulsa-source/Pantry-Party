/**
 * techniqueMotion — declarative loop specs for the technique glyphs.
 *
 * One spec per glyph id; each animatable layer gets keyframes over
 * transform/opacity ONLY (native-driver-safe). TechniqueGlyph drives every
 * spec with a single looping 0→1 progress value, so a keyframe's `at` is a
 * fraction of durationMs. Stagger (steam wisps, falling flakes) is encoded
 * as hold-then-play keyframes rather than per-layer delays.
 *
 * Contract (enforced by techniqueMotion.test.ts): within a layer, every
 * keyframe defines the same property set; first at=0 (rest pose — also the
 * reduce-motion freeze frame); last at=1; `at` strictly ascending.
 */
import type { TechniqueGlyphName } from './brandGlyphs.technique';

export interface MotionKeyframe {
  /** 0..1 fraction of the loop. */
  at: number;
  /** Translations are in 48-box glyph units; TechniqueGlyph scales them to the rendered size. */
  translateX?: number;
  translateY?: number;
  /** Degrees. */
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}

export interface LayerMotion {
  /** transform-origin within the glyph box, CSS-style percentages (of the WHOLE 48-box). */
  origin?: string;
  keyframes: MotionKeyframe[];
}

export interface MotionSpec {
  durationMs: number;
  layers: Record<string, LayerMotion>;
}

export const TECHNIQUE_MOTION: Record<TechniqueGlyphName, MotionSpec> = {
  chop: {
    durationMs: 1100,
    layers: {
      knife: {
        origin: '19% 41%',
        keyframes: [
          { at: 0, rotate: 0, translateY: 0 },
          { at: 0.45, rotate: -13, translateY: -1.5 },
          { at: 0.65, rotate: 1.5, translateY: 0 },
          { at: 1, rotate: 0, translateY: 0 },
        ],
      },
    },
  },

  stir: {
    durationMs: 1600,
    layers: {
      spoon: {
        origin: '48% 16%',
        keyframes: [
          { at: 0, translateX: 3, translateY: 0, rotate: 6 },
          { at: 0.25, translateX: 0, translateY: 1.5, rotate: 0 },
          { at: 0.5, translateX: -3, translateY: 0, rotate: -6 },
          { at: 0.75, translateX: 0, translateY: -1, rotate: 0 },
          { at: 1, translateX: 3, translateY: 0, rotate: 6 },
        ],
      },
    },
  },

  simmer: {
    durationMs: 2200,
    layers: {
      wisp1: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.27, translateY: -0.5, opacity: 0.85 },
          { at: 0.8, translateY: -7, opacity: 0 },
          { at: 1, translateY: -7, opacity: 0 },
        ],
      },
      wisp2: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.32, translateY: 2, opacity: 0 },
          { at: 0.55, translateY: -0.5, opacity: 0.85 },
          { at: 1, translateY: -7, opacity: 0 },
        ],
      },
      wisp3: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.6, translateY: 2, opacity: 0 },
          { at: 0.8, translateY: -0.5, opacity: 0.85 },
          { at: 1, translateY: -5, opacity: 0 },
        ],
      },
      lid: {
        origin: '50% 46%',
        keyframes: [
          { at: 0, translateY: 0, rotate: 0 },
          { at: 0.86, translateY: 0, rotate: 0 },
          { at: 0.9, translateY: -1.2, rotate: -1.2 },
          { at: 0.94, translateY: -0.6, rotate: 1.2 },
          { at: 1, translateY: 0, rotate: 0 },
        ],
      },
    },
  },

  flip: {
    durationMs: 1800,
    layers: {
      pancake: {
        origin: '44% 56%',
        keyframes: [
          { at: 0, translateY: 0, rotate: 0 },
          { at: 0.12, translateY: 0, rotate: 0 },
          { at: 0.46, translateY: -11, rotate: 178 },
          { at: 0.72, translateY: 0, rotate: 360 },
          { at: 1, translateY: 0, rotate: 360 },
        ],
      },
      pan: {
        origin: '79% 69%',
        keyframes: [
          { at: 0, rotate: 0, translateY: 0 },
          { at: 0.08, rotate: 0, translateY: 0 },
          { at: 0.14, rotate: -5, translateY: 1 },
          { at: 0.3, rotate: 2, translateY: 0 },
          { at: 0.46, rotate: 0, translateY: 0 },
          { at: 1, rotate: 0, translateY: 0 },
        ],
      },
    },
  },

  knead: {
    durationMs: 2400,
    layers: {
      dough: {
        origin: '50% 75%',
        keyframes: [
          { at: 0, scaleX: 1, scaleY: 1, rotate: 0, translateX: 0 },
          { at: 0.18, scaleX: 1.14, scaleY: 0.84, rotate: -2, translateX: 1.5 },
          { at: 0.34, scaleX: 0.97, scaleY: 1.03, rotate: 0, translateX: 0 },
          { at: 0.48, scaleX: 1, scaleY: 1, rotate: 0, translateX: 0 },
          { at: 0.66, scaleX: 1.14, scaleY: 0.84, rotate: 2, translateX: -1.5 },
          { at: 0.82, scaleX: 0.97, scaleY: 1.03, rotate: 0, translateX: 0 },
          { at: 1, scaleX: 1, scaleY: 1, rotate: 0, translateX: 0 },
        ],
      },
    },
  },

  season: {
    durationMs: 2400,
    layers: {
      jar: {
        origin: '76% 18%',
        keyframes: [
          { at: 0, rotate: 0 },
          { at: 0.35, rotate: -14 },
          { at: 0.7, rotate: -14 },
          { at: 1, rotate: 0 },
        ],
      },
      flake1: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.34, translateY: 0, opacity: 0 },
          { at: 0.42, translateY: 3, opacity: 1 },
          { at: 0.72, translateY: 13, opacity: 0 },
          { at: 1, translateY: 13, opacity: 0 },
        ],
      },
      flake2: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.44, translateY: 0, opacity: 0 },
          { at: 0.52, translateY: 3, opacity: 1 },
          { at: 0.82, translateY: 13, opacity: 0 },
          { at: 1, translateY: 13, opacity: 0 },
        ],
      },
      flake3: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.54, translateY: 0, opacity: 0 },
          { at: 0.62, translateY: 3, opacity: 1 },
          { at: 0.92, translateY: 13, opacity: 0 },
          { at: 1, translateY: 13, opacity: 0 },
        ],
      },
    },
  },

  pour: {
    durationMs: 2000,
    layers: {
      jug: {
        origin: '30% 23%',
        keyframes: [
          { at: 0, rotate: 0 },
          { at: 0.25, rotate: -10 },
          { at: 0.75, rotate: -10 },
          { at: 1, rotate: 0 },
        ],
      },
      drop1: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.28, translateY: 0, opacity: 0 },
          { at: 0.36, translateY: 3, opacity: 1 },
          { at: 0.66, translateY: 12, opacity: 0 },
          { at: 1, translateY: 12, opacity: 0 },
        ],
      },
      drop2: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.42, translateY: 0, opacity: 0 },
          { at: 0.5, translateY: 3, opacity: 1 },
          { at: 0.8, translateY: 12, opacity: 0 },
          { at: 1, translateY: 12, opacity: 0 },
        ],
      },
    },
  },

  grate: {
    durationMs: 1400,
    layers: {
      food: {
        keyframes: [
          { at: 0, translateX: 0, translateY: 0, opacity: 1 },
          { at: 0.45, translateX: -2.5, translateY: 4, opacity: 1 },
          { at: 0.55, translateX: -2.5, translateY: 4, opacity: 0 },
          { at: 0.65, translateX: 0, translateY: 0, opacity: 0 },
          { at: 0.75, translateX: 0, translateY: 0, opacity: 1 },
          { at: 1, translateX: 0, translateY: 0, opacity: 1 },
        ],
      },
    },
  },

  roll: {
    durationMs: 2000,
    layers: {
      pin: {
        keyframes: [
          { at: 0, translateX: -4, translateY: 0 },
          { at: 0.5, translateX: 4, translateY: -0.8 },
          { at: 1, translateX: -4, translateY: 0 },
        ],
      },
    },
  },

  rest: {
    durationMs: 2500,
    layers: {
      wisp: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.3, translateY: -0.5, opacity: 0.6 },
          { at: 0.85, translateY: -6, opacity: 0 },
          { at: 1, translateY: -6, opacity: 0 },
        ],
      },
    },
  },

  preheat: {
    durationMs: 2000,
    layers: {
      wave1: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.3, translateY: 0, opacity: 0.9 },
          { at: 0.8, translateY: -4, opacity: 0 },
          { at: 1, translateY: -4, opacity: 0 },
        ],
      },
      wave2: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.35, translateY: 2, opacity: 0 },
          { at: 0.6, translateY: 0, opacity: 0.9 },
          { at: 1, translateY: -4, opacity: 0 },
        ],
      },
    },
  },

  mash: {
    durationMs: 1300,
    layers: {
      masher: {
        keyframes: [
          { at: 0, translateY: 0 },
          { at: 0.4, translateY: 4 },
          { at: 0.55, translateY: 4 },
          { at: 0.85, translateY: 0 },
          { at: 1, translateY: 0 },
        ],
      },
    },
  },

  prep: { durationMs: 2000, layers: {} },

  cooking: {
    durationMs: 2500,
    layers: {
      wisp: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.3, translateY: -0.5, opacity: 0.7 },
          { at: 0.85, translateY: -6, opacity: 0 },
          { at: 1, translateY: -6, opacity: 0 },
        ],
      },
    },
  },

  finishing: { durationMs: 2000, layers: {} },
};
