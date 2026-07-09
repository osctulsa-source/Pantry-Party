import { describe, expect, it } from 'vitest';
import { daysForLocation, matchFood } from './shelfLifeLookup.ts';
import type { ShelfLifeRecord } from './shelfLifeData.generated.ts';

describe('matchFood', () => {
  it('matches an exact name', () => {
    expect(matchFood('butter')?.n).toBe('butter');
  });

  it('is case/punctuation-insensitive', () => {
    expect(matchFood('  BUTTER! ')?.n).toBe('butter');
  });

  it('prefers multi-token aliases over single tokens (orange juice != orange)', () => {
    const m = matchFood('orange juice');
    expect(m).not.toBeNull();
    // Must resolve via a juice-family entry, not fresh produce: juice keeps
    // for weeks+ in the pantry or fridge; an orange entry would be days.
    expect(m!.k.some((k) => k.includes('juice'))).toBe(true);
  });

  it('prefers the more specific chicken row for "chicken deli meat"', () => {
    const m = matchFood('chicken deli meat');
    expect(m).not.toBeNull();
    expect(m!.k).toContain('deli meat');
  });

  it('falls back to the generic row for bare "chicken"', () => {
    const m = matchFood('chicken');
    expect(m).not.toBeNull();
    expect(m!.n).toBe('chicken');
  });

  it('matches head nouns on later tokens ("fresh whole milk" -> milk)', () => {
    const m = matchFood('fresh whole milk');
    expect(m).not.toBeNull();
    expect(m!.k.some((k) => k.includes('milk'))).toBe(true);
  });

  it('returns null for gibberish', () => {
    expect(matchFood('zzqx flurbo')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchFood('')).toBeNull();
    expect(matchFood('   ')).toBeNull();
  });
});

describe('daysForLocation', () => {
  const rec: ShelfLifeRecord = { n: 'x', k: ['x'], p: 100, f: 5, z: 300 };

  it('uses the exact location when the record has it', () => {
    expect(daysForLocation(rec, 'pantry')).toBe(100);
    expect(daysForLocation(rec, 'fridge')).toBe(5);
    expect(daysForLocation(rec, 'freezer')).toBe(300);
  });

  it('falls back fridge -> pantry -> freezer when the location is missing on the record', () => {
    expect(daysForLocation({ n: 'x', k: ['x'], p: 100 }, 'fridge')).toBe(100);
    expect(daysForLocation({ n: 'x', k: ['x'], z: 300 }, 'pantry')).toBe(300);
  });

  it('treats custom/unknown locations with the same fallback order', () => {
    expect(daysForLocation(rec, 'garage shelf')).toBe(5);
    expect(daysForLocation(rec, undefined)).toBe(5);
  });
});
