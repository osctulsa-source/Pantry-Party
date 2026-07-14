import { ALLERGY_OPTIONS, DIET_OPTIONS } from '@breadbox/core';

import { ALLERGY_ART, DIET_ART } from './dietArt';

describe('dietArt', () => {
  it('covers every diet and allergy option', () => {
    for (const o of DIET_OPTIONS) expect(DIET_ART[o.slug]).toBeDefined();
    for (const o of ALLERGY_OPTIONS) expect(ALLERGY_ART[o.slug]).toBeDefined();
  });

  it('no glyph repeats across the screen', () => {
    const all = [...Object.values(DIET_ART), ...Object.values(ALLERGY_ART)];
    expect(new Set(all).size).toBe(all.length);
  });
});
