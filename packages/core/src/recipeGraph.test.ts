import { describe, it, expect } from 'vitest';

import {
  recipesUsingFood,
  matchRecipe,
  recipesWithinReach,
  signatureRecipe,
  type RecipeMeta,
} from './recipeGraph.ts';

function r(id: number, title: string, ingredients: string[], extra: Partial<RecipeMeta> = {}): RecipeMeta {
  return {
    id,
    title,
    cuisines: extra.cuisines ?? [],
    mealType: extra.mealType ?? 'main course',
    difficulty: extra.difficulty ?? 'easy',
    ingredients: ingredients.map((name) => ({ name })),
  };
}

const CATALOG: RecipeMeta[] = [
  r(1, 'Tomato Pasta', ['pasta', 'tomatoes', 'garlic', 'olive oil']),
  r(2, 'Cheese Omelette', ['eggs', 'cheddar cheese', 'butter']),
  r(3, 'Grape Salad', ['grapes', 'walnuts', 'yogurt']),
  r(4, 'Buttered Toast', ['bread', 'butter']),
];

describe('recipesUsingFood', () => {
  it('finds recipes that reference a food (token match, plural-tolerant)', () => {
    expect(recipesUsingFood('tomato', CATALOG).map((x) => x.id)).toEqual([1]);
    expect(recipesUsingFood('butter', CATALOG).map((x) => x.id)).toEqual([2, 4]);
    // "cheese" matches "cheddar cheese" via the shared token
    expect(recipesUsingFood('cheese', CATALOG).map((x) => x.id)).toEqual([2]);
  });

  it('returns nothing for an unknown food', () => {
    expect(recipesUsingFood('dragonfruit', CATALOG)).toEqual([]);
  });
});

describe('matchRecipe', () => {
  it('splits ingredients into have / missing and treats staples as had', () => {
    const m = matchRecipe(r(9, 'Test', ['pasta', 'tomatoes', 'salt', 'basil']), ['Penne pasta', 'Roma tomatoes']);
    expect(m.have.sort()).toEqual(['pasta', 'salt', 'tomatoes']); // salt is an assumed staple
    expect(m.missing).toEqual(['basil']);
  });
});

describe('recipesWithinReach', () => {
  it('returns recipes you are close to, closest first, excluding fully-stocked', () => {
    // Pantry has pasta + tomatoes + eggs. Recipe 1 missing garlic+oil (2), recipe 2 missing cheese (1, butter staple? no).
    const pantry = ['Spaghetti pasta', 'Cherry tomatoes', 'Free-range eggs', 'butter'];
    const reach = recipesWithinReach(CATALOG, pantry, 2);
    const ids = reach.map((m) => m.recipe.id);
    // recipe 2 (missing cheese only) should rank before recipe 1 (missing garlic+oil)
    expect(ids[0]).toBe(2);
    expect(ids).toContain(1);
    // recipe 4 (bread+butter): butter in hand, bread missing = 1 → within reach
    expect(ids).toContain(4);
  });

  it('excludes recipes with zero ingredients in hand', () => {
    const reach = recipesWithinReach(CATALOG, ['quinoa'], 3);
    expect(reach).toEqual([]);
  });
});

describe('signatureRecipe', () => {
  it('picks the recipe where the food is most central (fewest ingredients)', () => {
    // butter appears in recipe 2 (3 ingredients) and 4 (2 ingredients) → 4 wins
    expect(signatureRecipe('butter', CATALOG)?.id).toBe(4);
  });

  it('returns null when nothing uses the food', () => {
    expect(signatureRecipe('kale', CATALOG)).toBeNull();
  });
});
