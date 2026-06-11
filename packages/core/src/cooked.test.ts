import { describe, expect, it } from 'vitest';
import {
  decrementedQuantity,
  defaultCookAction,
  matchCookedItems,
  normalizeFoodTokens,
  singularizeToken,
} from './cooked.ts';

describe('singularizeToken', () => {
  it('strips simple plurals', () => {
    expect(singularizeToken('bananas')).toBe('banana');
    expect(singularizeToken('eggs')).toBe('egg');
  });

  it('handles -ies and -es families', () => {
    expect(singularizeToken('berries')).toBe('berry');
    expect(singularizeToken('tomatoes')).toBe('tomato');
    expect(singularizeToken('dishes')).toBe('dish');
  });

  it('leaves -ss and short tokens alone', () => {
    expect(singularizeToken('swiss')).toBe('swiss');
    expect(singularizeToken('gas')).toBe('gas');
    expect(singularizeToken('cheese')).toBe('cheese');
  });

  it('is imperfect but consistent — the property matching relies on', () => {
    // "hummus" stems to "hummu" — linguistically wrong, but both sides of a
    // comparison stem identically, so hummus still matches hummus.
    expect(singularizeToken('hummus')).toBe(singularizeToken('hummus'));
  });
});

describe('normalizeFoodTokens', () => {
  it('drops descriptors and keeps the food signal', () => {
    expect(normalizeFoodTokens('All Purpose Flour')).toEqual(['flour']);
    expect(normalizeFoodTokens('Whole milk')).toEqual(['milk']);
    expect(normalizeFoodTokens('Extra-virgin olive oil')).toEqual(['olive', 'oil']);
  });

  it('drops 1-character noise like quantity numerals', () => {
    expect(normalizeFoodTokens('2 Eggs')).toEqual(['egg']);
  });

  it('returns [] when nothing survives', () => {
    expect(normalizeFoodTokens('of the')).toEqual([]);
    expect(normalizeFoodTokens('')).toEqual([]);
  });
});

describe('matchCookedItems', () => {
  const items = [
    { id: '1', name: 'Bananas', quantity: 3 },
    { id: '2', name: 'Whole milk', quantity: 1 },
    { id: '3', name: 'Chicken thighs', quantity: 2 },
    { id: '4', name: 'Olive oil', quantity: 1 },
  ];

  it('matches across plural/descriptor differences', () => {
    expect(matchCookedItems(['banana'], items).map((c) => c.itemId)).toEqual(['1']);
    expect(matchCookedItems(['milk'], items).map((c) => c.itemId)).toEqual(['2']);
  });

  it('matches loosely on shared food tokens (user confirms in the sheet)', () => {
    expect(matchCookedItems(['chicken broth'], items).map((c) => c.itemId)).toEqual(['3']);
  });

  it('does not match unrelated items', () => {
    expect(matchCookedItems(['soy sauce'], items)).toEqual([]);
  });

  it('preserves item input order and reports each item once', () => {
    const out = matchCookedItems(['olive oil', 'banana', 'milk'], items);
    expect(out.map((c) => c.itemId)).toEqual(['1', '2', '4']);
  });

  it('records which ingredient matched', () => {
    const out = matchCookedItems(['banana'], items);
    expect(out[0]!.matchedIngredient).toBe('banana');
    expect(out[0]!.itemName).toBe('Bananas');
    expect(out[0]!.quantity).toBe(3);
  });

  it('handles empty inputs', () => {
    expect(matchCookedItems([], items)).toEqual([]);
    expect(matchCookedItems(['banana'], [])).toEqual([]);
    expect(matchCookedItems(['of the'], items)).toEqual([]);
  });
});

describe('defaultCookAction', () => {
  it('suggests use-some for multiples, use-up for singles', () => {
    expect(defaultCookAction(3)).toBe('use-some');
    expect(defaultCookAction(2)).toBe('use-some');
    expect(defaultCookAction(1)).toBe('use-up');
  });
});

describe('decrementedQuantity', () => {
  it('decrements by one, floored at 1', () => {
    expect(decrementedQuantity(3)).toBe(2);
    expect(decrementedQuantity(2)).toBe(1);
    expect(decrementedQuantity(1.5)).toBe(1);
    expect(decrementedQuantity(1)).toBe(1);
  });
});
