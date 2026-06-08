import { describe, it, expect } from 'vitest';

import { applyPrefEvent, scoreTitle, tokenizeTitle } from './recipePrefs';

describe('tokenizeTitle', () => {
  it('lowercases, splits, drops stopwords + short words, de-dupes', () => {
    expect(tokenizeTitle('The Best Easy Chicken Curry')).toEqual(['chicken', 'curry']);
    expect(tokenizeTitle('Spinach & Spinach Frittata')).toEqual(['spinach', 'frittata']);
  });

  it('handles leading non-letters', () => {
    expect(tokenizeTitle('5-Ingredient Banana Bread')).toEqual(['ingredient', 'banana', 'bread']);
  });
});

describe('applyPrefEvent + scoreTitle', () => {
  it('like raises the score for titles sharing tokens; skip lowers it', () => {
    let p: Record<string, number> = {};
    p = applyPrefEvent(p, 'Chicken Curry', 'like'); // chicken +2, curry +2
    expect(scoreTitle(p, 'Chicken Tikka')).toBe(2); // shares "chicken"
    p = applyPrefEvent(p, 'Chicken Curry', 'skip'); // chicken 0.5, curry 0.5
    expect(scoreTitle(p, 'Chicken Tikka')).toBeCloseTo(0.5);
  });

  it('does not mutate the input map', () => {
    const p = { chicken: 1 };
    const n = applyPrefEvent(p, 'Chicken Soup', 'like');
    expect(p).toEqual({ chicken: 1 });
    expect(n.chicken).toBe(3);
  });

  it('clamps weights so one word cannot dominate', () => {
    let p: Record<string, number> = {};
    for (let i = 0; i < 10; i++) p = applyPrefEvent(p, 'Chicken', 'like');
    expect(scoreTitle(p, 'Chicken')).toBeLessThanOrEqual(8);
  });

  it('scores unknown titles at 0', () => {
    expect(scoreTitle({}, 'Mystery Stew')).toBe(0);
  });
});
