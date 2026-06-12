import { describe, it, expect } from 'vitest';

import { FOOD_GUIDES, guideFor, makeRefinedName, plainName } from './foodKinds.ts';

describe('guideFor', () => {
  it('matches a generic food, case-insensitive', () => {
    expect(guideFor('Pasta')?.guide.food).toBe('pasta');
    expect(guideFor('pasta')?.guide.food).toBe('pasta');
    expect(guideFor('  PASTA ')?.guide.food).toBe('pasta');
    expect(guideFor('Pasta')?.activeKind).toBeNull();
  });

  it('is plural/singular tolerant on the food', () => {
    expect(guideFor('pastas')?.guide.food).toBe('pasta');
    expect(guideFor('bean')?.guide.food).toBe('beans');
    expect(guideFor('tomato')?.guide.food).toBe('tomatoes');
    expect(guideFor('egg')?.guide.food).toBe('eggs');
  });

  it('detects refined kind-first names and reports the active kind', () => {
    const m = guideFor('Penne pasta');
    expect(m?.guide.food).toBe('pasta');
    expect(m?.activeKind).toBe('Penne');
    expect(guideFor('whole wheat bread')?.activeKind).toBe('Whole wheat');
  });

  it('detects refined food-first names (chicken)', () => {
    const m = guideFor('Chicken thighs');
    expect(m?.guide.food).toBe('chicken');
    expect(m?.activeKind).toBe('Thighs');
    // plural tolerance applies to the kind token too
    expect(guideFor('chicken thigh')?.activeKind).toBe('Thighs');
  });

  it('never matches compound names that merely contain a food', () => {
    expect(guideFor('Pasta sauce')).toBeUndefined();
    expect(guideFor('Chicken broth')).toBeUndefined();
    expect(guideFor('Rice cakes')).toBeUndefined();
  });

  it('never matches a bare kind without its food', () => {
    expect(guideFor('Penne')).toBeUndefined();
    expect(guideFor('Sourdough')).toBeUndefined();
  });

  it('returns undefined for empty and unknown names', () => {
    expect(guideFor('')).toBeUndefined();
    expect(guideFor('   ')).toBeUndefined();
    expect(guideFor('Sriracha')).toBeUndefined();
  });
});

describe('makeRefinedName / plainName', () => {
  it('composes kind-first names', () => {
    const pasta = FOOD_GUIDES.find((g) => g.food === 'pasta')!;
    expect(makeRefinedName(pasta, 'Penne')).toBe('Penne pasta');
    expect(plainName(pasta)).toBe('Pasta');
  });

  it('composes food-first names with the kind lowercased', () => {
    const chicken = FOOD_GUIDES.find((g) => g.food === 'chicken')!;
    expect(makeRefinedName(chicken, 'Breasts')).toBe('Chicken breasts');
    expect(plainName(chicken)).toBe('Chicken');
  });

  it('round-trips: every composed name is detected with its kind active', () => {
    for (const guide of FOOD_GUIDES) {
      for (const kind of guide.kinds) {
        const match = guideFor(makeRefinedName(guide, kind));
        expect(match?.guide.food).toBe(guide.food);
        expect(match?.activeKind).toBe(kind);
      }
      expect(guideFor(plainName(guide))?.guide.food).toBe(guide.food);
    }
  });
});
