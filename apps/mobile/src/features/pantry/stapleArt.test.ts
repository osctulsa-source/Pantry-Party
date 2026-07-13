import { STAPLE_GROUPS } from './staples';
import { STAPLE_ART, stapleGlyph } from './stapleArt';

describe('stapleArt', () => {
  it('every staple has an explicit glyph (no-sharing rule)', () => {
    for (const group of STAPLE_GROUPS) {
      for (const item of group.items) {
        expect(STAPLE_ART[item.name]).toBeDefined();
      }
    }
  });

  it('no two staples share a glyph', () => {
    const glyphs = Object.values(STAPLE_ART);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('falls back to jar for unknown names', () => {
    expect(stapleGlyph('Some future staple')).toBe('jar');
  });
});
