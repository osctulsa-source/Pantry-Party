import { describe, expect, it } from 'vitest';
import { SHELF_LIFE_DATA } from './shelfLifeData.generated.ts';

describe('shelfLifeData.generated', () => {
  it('has broad coverage', () => {
    expect(SHELF_LIFE_DATA.length).toBeGreaterThanOrEqual(400);
  });

  it('every record has >=1 duration, all within 1..3650 days, and aliases', () => {
    for (const r of SHELF_LIFE_DATA) {
      const days = [r.p, r.f, r.z].filter((d): d is number => d !== undefined);
      expect(days.length, r.n).toBeGreaterThan(0);
      for (const d of days) {
        expect(d, r.n).toBeGreaterThanOrEqual(1);
        expect(d, r.n).toBeLessThanOrEqual(3650);
      }
      expect(r.k.length, r.n).toBeGreaterThan(0);
      expect(r.k, r.n).toContain(r.n);
    }
  });

  it('location-awareness exists in the data (fridge != freezer for whole chicken)', () => {
    const chicken = SHELF_LIFE_DATA.find((r) => r.n === 'chicken' && r.k.includes('whole'));
    expect(chicken).toBeDefined();
    expect(chicken!.f).toBeLessThanOrEqual(3);
    expect(chicken!.z).toBeGreaterThanOrEqual(200);
  });
});
