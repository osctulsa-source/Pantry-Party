import { describe, it, expect } from 'vitest';

import { computeRecipeCollections, type CookEventLite } from './recipeCollections.ts';
import type { RecipeMeta } from './recipeGraph.ts';

function r(id: number, cuisines: string[], mealType: string): RecipeMeta {
  return { id, title: `Recipe ${id}`, cuisines, mealType, difficulty: 'easy', ingredients: [] };
}

const CATALOG: RecipeMeta[] = [
  r(1, ['italian'], 'main course'),
  r(2, ['mexican'], 'main course'),
  r(3, ['italian'], 'dessert'),
  r(4, [], 'breakfast'),
  r(5, ['french'], 'dessert'),
];

const cook = (recipeId: number, cookedAt: string): CookEventLite => ({ recipeId, cookedAt });

describe('computeRecipeCollections', () => {
  it('is empty with no cooks but still shows the full catalog to fill', () => {
    const s = computeRecipeCollections([], CATALOG);
    expect(s.cookbook).toEqual({ collected: 0, total: 5, complete: false });
    // 3 distinct cuisines present (italian, mexican, french) — empty entries dropped
    expect(s.cuisines.total).toBe(3);
    expect(s.cuisines.collected).toBe(0);
    // 3 meal types present (main course, dessert, breakfast)
    expect(s.meals.total).toBe(3);
  });

  it('collects the cookbook by distinct cooked recipe, ignoring dupes', () => {
    const s = computeRecipeCollections(
      [cook(1, '2026-07-01'), cook(1, '2026-07-05'), cook(2, '2026-07-02')],
      CATALOG,
    );
    expect(s.cookbook.collected).toBe(2);
    expect(s.cookCounts[1]).toBe(2);
    expect(s.firstCooked[1]).toBe('2026-07-01'); // earliest kept
  });

  it('fills a cuisine slot once any dish of it is cooked (the passport)', () => {
    const s = computeRecipeCollections([cook(1, '2026-07-01')], CATALOG);
    const italian = s.cuisines.slots.find((x) => x.key === 'italian');
    expect(italian?.collected).toBe(true);
    expect(italian?.count).toBe(1); // only recipe 1 of the two italian recipes cooked
    expect(s.cuisines.slots.find((x) => x.key === 'mexican')?.collected).toBe(false);
    expect(s.cuisines.collected).toBe(1);
  });

  it('fills meal slots and title-cases labels', () => {
    const s = computeRecipeCollections([cook(3, '2026-07-01')], CATALOG);
    const dessert = s.meals.slots.find((x) => x.key === 'dessert');
    expect(dessert?.label).toBe('Dessert');
    expect(dessert?.collected).toBe(true);
    const main = s.cuisines.slots.find((x) => x.key === 'italian');
    expect(main?.label).toBe('Italian');
  });

  it('ignores cooks of recipes not in the catalog', () => {
    const s = computeRecipeCollections([cook(999, '2026-07-01')], CATALOG);
    expect(s.cookbook.collected).toBe(0);
  });
});
