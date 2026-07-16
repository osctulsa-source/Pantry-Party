import { STAGES, TECHNIQUES, TECHNIQUE_GLYPHS } from './brandGlyphs.technique';
import { TECHNIQUE_MOTION } from './techniqueMotion';

const ALL_IDS = [...TECHNIQUES, ...STAGES];

describe('technique motion specs', () => {
  it('covers every technique and stage id exactly', () => {
    expect(Object.keys(TECHNIQUE_MOTION).sort()).toEqual([...ALL_IDS].sort());
  });

  it('durations are calm: 1000-2500ms', () => {
    for (const id of ALL_IDS) {
      const d = TECHNIQUE_MOTION[id].durationMs;
      expect(d).toBeGreaterThanOrEqual(1000);
      expect(d).toBeLessThanOrEqual(2500);
    }
  });

  it('every motion layer targets a real glyph layer, and vice versa', () => {
    for (const id of ALL_IDS) {
      const glyphLayerIds = TECHNIQUE_GLYPHS[id].layers.map((l) => l.id).sort();
      const motionLayerIds = Object.keys(TECHNIQUE_MOTION[id].layers).sort();
      expect(motionLayerIds).toEqual(glyphLayerIds);
    }
  });

  it('keyframes: same property set per layer, at 0→1 strictly ascending', () => {
    for (const id of ALL_IDS) {
      for (const [layerId, motion] of Object.entries(TECHNIQUE_MOTION[id].layers)) {
        const kfs = motion.keyframes;
        const label = `${id}/${layerId}`;
        expect(kfs.length).toBeGreaterThanOrEqual(2);
        expect(kfs[0].at).toBe(0);
        expect(kfs[kfs.length - 1].at).toBe(1);
        const firstKeys = Object.keys(kfs[0]).sort();
        for (let i = 0; i < kfs.length; i++) {
          expect({ label, keys: Object.keys(kfs[i]).sort() }).toEqual({ label, keys: firstKeys });
          if (i > 0) expect(kfs[i].at).toBeGreaterThan(kfs[i - 1].at);
        }
      }
    }
  });
});
