import { browseCurated } from './curatedSource';

describe('browseCurated', () => {
  it('returns curated recipes with no pantry-match counts', () => {
    const res = browseCurated({ number: 5 });
    expect(res.length).toBeGreaterThan(0);
    expect(res.length).toBeLessThanOrEqual(5);
    for (const r of res) {
      expect(r.usedIngredientCount).toBe(0);
      expect(r.missedIngredientCount).toBe(0);
      expect(r.usedIngredientNames).toEqual([]);
      expect(r.missedIngredientNames).toEqual([]);
    }
  });

  it('filters by meal type to a subset of the unfiltered set', () => {
    const all = browseCurated({ number: 500 });
    const desserts = browseCurated({ type: 'dessert', number: 500 });
    const allIds = new Set(all.map((r) => r.id));
    expect(desserts.length).toBeGreaterThan(0);
    expect(desserts.length).toBeLessThan(all.length);
    for (const r of desserts) expect(allIds.has(r.id)).toBe(true);
  });

  it('orders by ready time ascending, unknown times last', () => {
    const res = browseCurated({ number: 500 });
    const times = res.map((r) => r.readyInMinutes ?? Number.POSITIVE_INFINITY);
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it('pages via offset', () => {
    const first = browseCurated({ number: 3, offset: 0 });
    const second = browseCurated({ number: 3, offset: 3 });
    expect(first.map((r) => r.id)).not.toEqual(second.map((r) => r.id));
  });
});
