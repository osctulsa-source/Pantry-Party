import { describe, it, expect } from 'vitest';

import { computeCollections, masteryTier } from './collections.ts';
import { FOOD_GUIDES } from './foodKinds.ts';

/** Pull a set out of the summary by its food key. */
function set(summary: ReturnType<typeof computeCollections>, food: string) {
  const s = summary.sets.find((x) => x.food === food);
  if (!s) throw new Error(`no set for ${food}`);
  return s;
}

describe('computeCollections', () => {
  it('returns the full catalog with zero progress for empty input', () => {
    const result = computeCollections([]);
    expect(result.setsTotal).toBe(FOOD_GUIDES.length);
    expect(result.varietiesCollected).toBe(0);
    expect(result.varietiesTotal).toBe(
      FOOD_GUIDES.reduce((n, g) => n + g.kinds.length, 0),
    );
    expect(result.setsComplete).toBe(0);
    expect(result.nearestToComplete).toBeNull();
    // Every set is present but empty — the aspirational catalog.
    expect(result.sets.every((s) => s.count === 0)).toBe(true);
  });

  it('fills a slot only for a SPECIFIC variety, not the generic name', () => {
    const generic = computeCollections(['Cheese']);
    expect(set(generic, 'cheese').count).toBe(0);

    const specific = computeCollections(['Cheddar cheese', 'Mozzarella cheese']);
    const cheese = set(specific, 'cheese');
    expect(cheese.count).toBe(2);
    expect(cheese.collected).toEqual(['Cheddar', 'Mozzarella']);
    expect(cheese.complete).toBe(false);
  });

  it('collected/remaining preserve the guide canonical order', () => {
    // Log kinds out of order; output should follow FOOD_GUIDES order.
    const result = computeCollections(['Parmesan cheese', 'Cheddar cheese']);
    const cheese = set(result, 'cheese');
    expect(cheese.collected).toEqual(['Cheddar', 'Parmesan']);
    expect(cheese.remaining).toEqual(['Mozzarella', 'Swiss', 'Feta', 'Goat']);
  });

  it('is un-grindable: duplicates and plurals count once', () => {
    const result = computeCollections([
      'Cheddar cheese',
      'Cheddar cheese', // exact duplicate
      'Cheddar cheeses', // plural — normalizes to the same variety
    ]);
    expect(set(result, 'cheese').count).toBe(1);
  });

  it('marks a set complete and counts it once every kind is logged', () => {
    // Butter is the smallest set (Salted / Unsalted / Plant-based).
    const result = computeCollections([
      'Salted butter',
      'Unsalted butter',
      'Plant-based butter',
    ]);
    const butter = set(result, 'butter');
    expect(butter.complete).toBe(true);
    expect(butter.remaining).toEqual([]);
    expect(result.setsComplete).toBe(1);
  });

  it('surfaces the set nearest to completion as the nudge', () => {
    // Butter: 2/3 (1 remaining). Cheese: 1/6 (5 remaining). Butter is nearer.
    const result = computeCollections([
      'Salted butter',
      'Unsalted butter',
      'Cheddar cheese',
    ]);
    expect(result.nearestToComplete?.food).toBe('butter');
    // ...and it sorts to the front of the list.
    expect(result.sets[0]?.food).toBe('butter');
  });

  it('orders active sets ahead of completed trophies and untouched sets', () => {
    const result = computeCollections([
      // butter fully complete (trophy)
      'Salted butter',
      'Unsalted butter',
      'Plant-based butter',
      // rice in progress (active) — should sort ahead of the trophy
      'Jasmine rice',
    ]);
    const activeIdx = result.sets.findIndex((s) => s.food === 'rice');
    const trophyIdx = result.sets.findIndex((s) => s.food === 'butter');
    const untouchedIdx = result.sets.findIndex((s) => s.count === 0);
    expect(activeIdx).toBeLessThan(trophyIdx);
    expect(trophyIdx).toBeLessThan(untouchedIdx);
  });

  it('collects produce varieties (the grapes example)', () => {
    const result = computeCollections([
      'Concord grapes',
      'Red grapes',
      'Champagne grapes',
    ]);
    const grapes = set(result, 'grapes');
    expect(grapes.count).toBe(3);
    expect(grapes.collected).toEqual(['Red', 'Concord', 'Champagne']);
  });

  it('ignores names that match no guide', () => {
    const result = computeCollections(['Sriracha', 'Paper towels', 'Toothpaste']);
    expect(result.varietiesCollected).toBe(0);
  });

  it('assigns a mastery tier per set', () => {
    // grapes total 6: 3 collected → silver (0.5)
    const grapes = set(computeCollections(['Red grapes', 'Concord grapes', 'Champagne grapes']), 'grapes');
    expect(grapes.tier).toBe('silver');
    // 1 of 6 → bronze; untouched → empty
    const one = computeCollections(['Red grapes']);
    expect(set(one, 'grapes').tier).toBe('bronze');
    expect(set(one, 'cheese').tier).toBe('empty');
    // butter fully collected (3/3) → gold
    const butter = set(computeCollections(['Salted butter', 'Unsalted butter', 'Plant-based butter']), 'butter');
    expect(butter.tier).toBe('gold');
  });
});

describe('masteryTier', () => {
  it('maps fraction collected to a tier, un-grindably (distinct only)', () => {
    expect(masteryTier(0, 6)).toBe('empty');
    expect(masteryTier(1, 6)).toBe('bronze');
    expect(masteryTier(3, 6)).toBe('silver'); // exactly 0.5
    expect(masteryTier(5, 6)).toBe('silver');
    expect(masteryTier(6, 6)).toBe('gold');
    expect(masteryTier(0, 0)).toBe('empty'); // guard against divide-by-zero
  });
});
