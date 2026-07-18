import { describe, expect, it } from 'vitest';

import { detectUncoveredStaples } from './staples';

describe('detectUncoveredStaples', () => {
  it('flags a staple whose ingredient is used but never mentioned in any step', () => {
    // The exact bug: rice is a used ingredient, but every step only covers the chicken.
    const out = detectUncoveredStaples(
      ['chicken thighs', 'rice', 'soy sauce'],
      ['Season the chicken thighs and sear until golden.', 'Simmer the chicken in the sauce for 10 minutes.'],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'rice', label: 'Rice' });
    expect(out[0]?.instructions).toMatch(/water/i);
  });

  it('does not flag a staple whose own name is mentioned in a step', () => {
    const out = detectUncoveredStaples(
      ['chicken thighs', 'rice'],
      ['Sear the chicken.', 'Meanwhile, cook the rice according to package directions.'],
    );
    expect(out).toEqual([]);
  });

  it('does not flag a staple covered only by its generic term in a step', () => {
    const out = detectUncoveredStaples(
      ['chicken breast', 'spaghetti'],
      ['Sear the chicken breast.', 'Boil the pasta until al dente.'],
    );
    expect(out).toEqual([]);
  });

  it('does not treat "rice vinegar" as the rice staple', () => {
    const out = detectUncoveredStaples(['chicken', 'rice vinegar'], ['Sear the chicken.']);
    expect(out).toEqual([]);
  });

  it('does not flag an ingredient that already says it is pre-cooked', () => {
    // "cooked rice" is a distinct token set from "rice" — the recipe explicitly
    // wants pre-cooked rice as a component, so no basics note is needed.
    const out = detectUncoveredStaples(['cooked rice', 'egg', 'scallion'], ['Scramble the egg with the scallion.']);
    expect(out).toEqual([]);
  });

  it('returns multiple uncovered staples when more than one applies', () => {
    const out = detectUncoveredStaples(['chicken', 'rice', 'quinoa'], ['Sear the chicken.']);
    expect(out.map((s) => s.id).sort()).toEqual(['quinoa', 'rice']);
  });

  it('returns empty when no staples are present', () => {
    const out = detectUncoveredStaples(['chicken', 'broccoli', 'garlic'], ['Sear the chicken with garlic.']);
    expect(out).toEqual([]);
  });

  it('returns empty for empty inputs', () => {
    expect(detectUncoveredStaples([], ['Cook the rice.'])).toEqual([]);
    expect(detectUncoveredStaples(['rice'], [])).toHaveLength(1);
  });

  it('is plural/descriptor tolerant on the ingredient side', () => {
    const out = detectUncoveredStaples(['Jasmine Rice'], ['Sear the chicken.']);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('rice');
  });
});
