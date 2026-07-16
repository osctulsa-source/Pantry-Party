import { STAGES, TECHNIQUES, TECHNIQUE_GLYPHS } from './brandGlyphs.technique';

// Mirrors brandGlyphs.test.ts: the glyph record and the id lists must cover
// exactly the same names, so every future technique/stage addition is guarded
// structurally.
describe('technique glyph family', () => {
  const allIds = [...TECHNIQUES, ...STAGES].sort();

  it('the glyph record covers every technique and stage id exactly', () => {
    expect(Object.keys(TECHNIQUE_GLYPHS).sort()).toEqual(allIds);
  });

  it('layer ids are unique within each glyph', () => {
    for (const id of allIds) {
      const layerIds = TECHNIQUE_GLYPHS[id as keyof typeof TECHNIQUE_GLYPHS].layers.map((l) => l.id);
      expect(new Set(layerIds).size).toBe(layerIds.length);
    }
  });
});
