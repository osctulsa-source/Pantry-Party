import { describe, it, expect } from 'vitest';
import { parseFavoriteRecipe } from './favorites.ts';

describe('FavoriteRecipe', () => {
  const validFavorite = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    householdId: '223e4567-e89b-12d3-a456-426614174000',
    recipeId: 101,
    title: 'Awesome Pancakes',
    image: 'https://example.com/pancakes.jpg',
    readyMinutes: 25,
    healthScore: 85,
    payload: '{"some":"recipe-details"}',
    addedBy: 'user-1',
    addedAt: '2026-06-30T12:00:00.000Z',
    updatedAt: Date.now(),
    deleted: false,
  };

  it('validates a correct favorite recipe successfully', () => {
    const parsed = parseFavoriteRecipe(validFavorite);
    expect(parsed).toEqual(validFavorite);
  });

  it('throws validation error if ID is not a UUID', () => {
    const invalid = { ...validFavorite, id: 'not-a-uuid' };
    expect(() => parseFavoriteRecipe(invalid)).toThrow();
  });

  it('throws validation error if title is empty', () => {
    const invalid = { ...validFavorite, title: '' };
    expect(() => parseFavoriteRecipe(invalid)).toThrow();
  });

  it('throws validation error if recipeId is not an integer', () => {
    const invalid = { ...validFavorite, recipeId: 12.34 };
    expect(() => parseFavoriteRecipe(invalid)).toThrow();
  });

  it('throws validation error if addedAt is not a valid datetime string', () => {
    const invalid = { ...validFavorite, addedAt: '2026-06-30' };
    expect(() => parseFavoriteRecipe(invalid)).toThrow();
  });
});
