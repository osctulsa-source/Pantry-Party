import { describe, it, expect } from 'vitest';

import { topCooked, buildTasteProfile } from './taste.ts';
import { scoreTitle } from './recipePrefs.ts';
import type { ActivityEvent } from './activity.ts';
import type { FavoriteRecipe } from './favorites.ts';

// Minimal valid factories — topCooked/buildTasteProfile only read kind/refId/
// label (events) and title (favorites), but we build full shapes so the types
// hold without casts to `any`.
function ev(kind: string, label: string, refId?: string): ActivityEvent {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    householdId: '00000000-0000-0000-0000-000000000002',
    kind,
    refId,
    label,
    occurredAt: '2026-06-22T12:00:00.000Z',
    addedBy: 'user-1',
    updatedAt: 1,
    deleted: false,
  } as ActivityEvent;
}

function fav(title: string): FavoriteRecipe {
  return {
    id: '00000000-0000-0000-0000-000000000003',
    householdId: '00000000-0000-0000-0000-000000000002',
    recipeId: 1,
    title,
    payload: '{}',
    addedBy: 'user-1',
    addedAt: '2026-06-22T12:00:00.000Z',
    updatedAt: 1,
    deleted: false,
  } as FavoriteRecipe;
}

describe('topCooked', () => {
  it('counts cooked events by recipe and sorts most-cooked first', () => {
    const events = [
      ev('cooked', 'Pasta', '1'),
      ev('cooked', 'Pasta', '1'),
      ev('cooked', 'Tacos', '2'),
      ev('used', 'Spinach'), // ignored — not a cook
      ev('cooked', 'No Ref'), // ignored — no refId
      ev('cooked', 'Bad Ref', 'abc'), // ignored — non-numeric refId
    ];
    expect(topCooked(events, 5)).toEqual([
      { recipeId: 1, title: 'Pasta', count: 2 },
      { recipeId: 2, title: 'Tacos', count: 1 },
    ]);
  });

  it('respects the limit', () => {
    const events = [ev('cooked', 'A', '1'), ev('cooked', 'B', '2'), ev('cooked', 'C', '3')];
    expect(topCooked(events, 2)).toHaveLength(2);
  });

  it('returns empty when there are no cooked events', () => {
    expect(topCooked([ev('used', 'X'), ev('tossed', 'Y')], 5)).toEqual([]);
  });
});

describe('buildTasteProfile', () => {
  it('is empty with no favorites or cooks', () => {
    expect(buildTasteProfile([], [])).toEqual({});
  });

  it('nudges tokens from favorites so a similar title outscores an unrelated one', () => {
    const profile = buildTasteProfile([fav('Chicken Tikka Masala')], []);
    expect(scoreTitle(profile, 'Chicken Curry')).toBeGreaterThan(scoreTitle(profile, 'Beef Stew'));
  });

  it('weights a frequently-cooked recipe into the profile (positive, capped)', () => {
    const cooks = [
      ev('cooked', 'Pasta Carbonara', '1'),
      ev('cooked', 'Pasta Carbonara', '1'),
      ev('cooked', 'Pasta Carbonara', '1'),
      ev('cooked', 'Pasta Carbonara', '1'),
    ];
    const profile = buildTasteProfile([], cooks);
    const score = scoreTitle(profile, 'Pasta Carbonara');
    expect(score).toBeGreaterThan(0);
    // 2 content tokens, each clamped at 8 by the prefs engine.
    expect(score).toBeLessThanOrEqual(16);
  });

  it('combines favorites and cooks', () => {
    const profile = buildTasteProfile([fav('Lemon Salmon')], [ev('cooked', 'Garlic Salmon', '7')]);
    // "salmon" is reinforced by both a save and a cook.
    expect(scoreTitle(profile, 'Baked Salmon')).toBeGreaterThan(0);
  });
});
