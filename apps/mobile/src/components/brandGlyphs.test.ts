import { BRAND_FOODS, FOOD_TONE } from './BrandIcon';
import { CORE_GLYPHS } from './brandGlyphs.core';
import { MICRO_GLYPHS } from './brandGlyphs.micro';
import { PANTRY_GLYPHS } from './brandGlyphs.pantry';

// FOOD_TONE and the glyph record must cover exactly the same names, and the
// showcase order must not reference a missing glyph. Guards every future
// glyph addition (pantry staples, appliances, micro glyphs) structurally.
describe('brand glyph family', () => {
  it('every toned food has a glyph and vice versa', () => {
    const toneKeys = Object.keys(FOOD_TONE).sort();
    // Mirror BrandIcon's GLYPHS map, which composes core + pantry + micro.
    const glyphKeys = Object.keys({ ...CORE_GLYPHS, ...PANTRY_GLYPHS, ...MICRO_GLYPHS }).sort();
    expect(toneKeys).toEqual(glyphKeys);
  });

  it('BRAND_FOODS only lists real glyphs', () => {
    for (const name of BRAND_FOODS) {
      expect(FOOD_TONE[name]).toBeDefined();
    }
  });
});
