/**
 * seasonality — a small "in season now" foundation for collection cards (pure).
 *
 * A card that glows when its food is in season nudges seasonal eating (cheaper,
 * fresher, better) AND keeps the collection feeling alive month to month. This
 * is the data + helpers; the glow is UI. Northern-hemisphere US produce months
 * (1–12); deliberately approximate and easy to extend — coverage grows with the
 * icon set. Foods with no entry return null (unknown, not "out of season").
 */

/** food key (lowercase, matches foodKinds / glyph names) → peak months (1–12). */
export const SEASONALITY: Record<string, number[]> = {
  grapes: [8, 9, 10],
  apples: [9, 10, 11],
  peppers: [7, 8, 9, 10],
  tomatoes: [6, 7, 8, 9],
  strawberry: [5, 6, 7],
  carrot: [9, 10, 11, 12],
  lemon: [12, 1, 2, 3],
  avocado: [3, 4, 5, 6],
  mushroom: [9, 10, 11],
  chili: [7, 8, 9],
  pineapple: [3, 4, 5, 6],
};

/** In season this month? null when the food has no seasonality data. */
export function isInSeason(food: string, date: Date = new Date()): boolean | null {
  const months = SEASONALITY[food.toLowerCase()];
  if (!months) return null;
  return months.includes(date.getMonth() + 1);
}

const SEASON_NAME: Record<number, string> = {
  12: 'winter', 1: 'winter', 2: 'winter',
  3: 'spring', 4: 'spring', 5: 'spring',
  6: 'summer', 7: 'summer', 8: 'summer',
  9: 'autumn', 10: 'autumn', 11: 'autumn',
};

/** A human peak-season phrase ("late summer", "autumn"), or null if unknown. */
export function peakSeason(food: string): string | null {
  const months = SEASONALITY[food.toLowerCase()];
  if (!months || months.length === 0) return null;
  const seasons = [...new Set(months.map((m) => SEASON_NAME[m]))];
  return seasons.join(' & ');
}

/** The subset of the given foods that are in season on `date`. */
export function inSeasonNow(foods: string[], date: Date = new Date()): string[] {
  return foods.filter((f) => isInSeason(f, date) === true);
}
