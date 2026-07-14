import { COOKING_DEVICES } from '@breadbox/core';

import { DEVICE_ART, deviceGlyph } from './deviceArt';

describe('deviceArt', () => {
  it('covers every cooking device', () => {
    for (const d of COOKING_DEVICES) {
      expect(DEVICE_ART[d.id]).toBeDefined();
    }
  });

  it('no two devices share a glyph', () => {
    const glyphs = Object.values(DEVICE_ART);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('falls back to spoon for unknown ids', () => {
    expect(deviceGlyph('hologram-oven')).toBe('spoon');
  });
});
