import { describe, expect, it } from 'vitest';
import {
  KITCHEN_TIPS,
  TIP_CATEGORY_META,
  TIP_CATEGORY_ORDER,
} from './tips';

describe('kitchen tips library', () => {
  it('tip ids are unique', () => {
    const ids = KITCHEN_TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tip belongs to an ordered category', () => {
    for (const tip of KITCHEN_TIPS) {
      expect(TIP_CATEGORY_ORDER).toContain(tip.category);
    }
  });

  it('order and meta cover the same category set', () => {
    expect(new Set(TIP_CATEGORY_ORDER)).toEqual(new Set(Object.keys(TIP_CATEGORY_META)));
    expect(TIP_CATEGORY_ORDER.length).toBe(Object.keys(TIP_CATEGORY_META).length);
  });

  it('every category has at least 6 tips', () => {
    for (const cat of TIP_CATEGORY_ORDER) {
      const count = KITCHEN_TIPS.filter((t) => t.category === cat).length;
      expect(count, `category ${cat}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('tip bodies are non-empty and scannable (≤ 500 chars)', () => {
    for (const tip of KITCHEN_TIPS) {
      expect(tip.body.trim().length).toBeGreaterThan(0);
      expect(tip.body.length).toBeLessThanOrEqual(500);
    }
  });
});
