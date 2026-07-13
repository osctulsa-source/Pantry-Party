import { describe, it, expect } from 'vitest';

import {
  ALLERGY_OPTIONS,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  EMPTY_TASTE_PROFILE,
  FLAVOR_OPTIONS,
  isTasteProfileEmpty,
  seedPrefsFromTaste,
  type TasteProfile,
} from './tasteProfile';
import { scoreTitle } from './recipePrefs';

function profile(p: Partial<TasteProfile>): TasteProfile {
  return { ...EMPTY_TASTE_PROFILE, ...p };
}

describe('isTasteProfileEmpty', () => {
  it('is true for the empty profile', () => {
    expect(isTasteProfileEmpty(EMPTY_TASTE_PROFILE)).toBe(true);
  });

  it('is false once any dimension is set', () => {
    expect(isTasteProfileEmpty(profile({ cuisines: ['italian'] }))).toBe(false);
    expect(isTasteProfileEmpty(profile({ flavors: ['spicy'] }))).toBe(false);
    expect(isTasteProfileEmpty(profile({ diets: ['vegan'] }))).toBe(false);
    expect(isTasteProfileEmpty(profile({ speed: 'quick' }))).toBe(false);
  });
});

describe('option catalogs', () => {
  it('have unique slugs within each list', () => {
    for (const list of [CUISINE_OPTIONS, FLAVOR_OPTIONS, DIET_OPTIONS]) {
      const slugs = list.map((o) => o.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('every cuisine and flavor option produces a non-empty nudge (no unmapped slug)', () => {
    for (const o of CUISINE_OPTIONS) {
      expect(Object.keys(seedPrefsFromTaste(profile({ cuisines: [o.slug] }))).length).toBeGreaterThan(0);
    }
    for (const o of FLAVOR_OPTIONS) {
      expect(Object.keys(seedPrefsFromTaste(profile({ flavors: [o.slug] }))).length).toBeGreaterThan(0);
    }
  });
});

describe('seedPrefsFromTaste', () => {
  it('returns {} for an empty profile', () => {
    expect(seedPrefsFromTaste(EMPTY_TASTE_PROFILE)).toEqual({});
  });

  it('rewards titles that match a chosen cuisine', () => {
    const prefs = seedPrefsFromTaste(profile({ cuisines: ['italian'] }));
    expect(scoreTitle(prefs, 'Creamy Tomato Pasta')).toBeGreaterThan(0); // matches "pasta"
    expect(scoreTitle(prefs, 'Grilled Salmon Tacos')).toBe(0); // no italian tokens
  });

  it('rewards titles that match a chosen flavor', () => {
    const prefs = seedPrefsFromTaste(profile({ flavors: ['spicy'] }));
    expect(scoreTitle(prefs, 'Spicy Chili Chicken')).toBeGreaterThan(0); // "spicy" + "chili"
  });

  it('ignores diets and speed (filters, not nudges) and unknown slugs', () => {
    expect(seedPrefsFromTaste(profile({ diets: ['vegan'], speed: 'quick' }))).toEqual({});
    expect(seedPrefsFromTaste(profile({ cuisines: ['klingon'] }))).toEqual({});
  });

  it('stacks multiple picks', () => {
    const prefs = seedPrefsFromTaste(profile({ cuisines: ['italian'], flavors: ['herby'] }));
    // "basil" is a herby token; "pasta" is an italian token — a basil-pasta dish scores both.
    expect(scoreTitle(prefs, 'Basil Pesto Pasta')).toBeGreaterThan(scoreTitle(prefs, 'Plain Pasta'));
  });
});

describe('allergies field', () => {
  it('EMPTY_TASTE_PROFILE has an empty allergies list', () => {
    expect(EMPTY_TASTE_PROFILE.allergies).toEqual([]);
  });

  it('ALLERGY_OPTIONS carries the four supported allergens', () => {
    expect(ALLERGY_OPTIONS.map((o) => o.slug)).toEqual(['egg', 'soy', 'fish', 'shellfish']);
  });
});
