import { describe, expect, it } from 'vitest';

import { suggestSubstitutes } from './substitutions';

const pantry = (...names: string[]) => names.map((name, i) => ({ id: `id-${i}`, name }));

describe('suggestSubstitutes', () => {
  it('suggests a pantry stand-in for a missing ingredient', () => {
    const out = suggestSubstitutes(['sour cream'], pantry('Greek yogurt', 'Milk'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      missingIngredient: 'sour cream',
      pantryItemName: 'Greek yogurt',
      substitute: 'greek yogurt',
    });
  });

  it('matches descriptor-laden ingredient names against the canonical rule', () => {
    const out = suggestSubstitutes(['reduced fat sour cream'], pantry('Plain Greek yogurt'));
    expect(out).toHaveLength(1);
    expect(out[0]?.pantryItemName).toBe('Plain Greek yogurt');
  });

  it('respects substitute preference order', () => {
    // heavy cream prefers half and half over whole milk.
    const out = suggestSubstitutes(['heavy cream'], pantry('Whole milk', 'Half and half'));
    expect(out[0]?.pantryItemName).toBe('Half and half');
  });

  it('returns at most one suggestion per missing ingredient', () => {
    const out = suggestSubstitutes(['butter'], pantry('Margarine', 'Coconut oil', 'Olive oil'));
    expect(out).toHaveLength(1);
    expect(out[0]?.pantryItemName).toBe('Margarine');
  });

  it('handles multiple missing ingredients independently', () => {
    const out = suggestSubstitutes(
      ['sour cream', 'lemon juice', 'saffron'],
      pantry('Greek yogurt', 'Lime juice'),
    );
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.missingIngredient)).toEqual(['sour cream', 'lemon juice']);
  });

  it('is plural-tolerant on both sides', () => {
    const out = suggestSubstitutes(['shallots'], pantry('Onions'));
    expect(out).toHaveLength(1);
    expect(out[0]?.pantryItemName).toBe('Onions');
  });

  it('returns empty for unknown ingredients or an empty pantry', () => {
    expect(suggestSubstitutes(['dragon fruit'], pantry('Greek yogurt'))).toEqual([]);
    expect(suggestSubstitutes(['sour cream'], [])).toEqual([]);
    expect(suggestSubstitutes([], pantry('Greek yogurt'))).toEqual([]);
  });

  it('does not fire on partial-word noise', () => {
    // "buttermilk" must not match the "butter" rule (token is "buttermilk").
    const out = suggestSubstitutes(['buttermilk'], pantry('Margarine'));
    expect(out).toEqual([]);
  });
});
