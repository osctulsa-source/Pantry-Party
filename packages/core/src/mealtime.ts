/**
 * Time-of-day → default meal type for the Cook This suggestions. Pure, no I/O.
 * MealType values match Spoonacular's complexSearch `type` filter.
 */
export type MealType = 'breakfast' | 'main course' | 'dessert' | 'snack';

/** Sensible default meal for a 24h hour: breakfast → mains → late-night snack. */
export function defaultMealForHour(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 21) return 'main course';
  return 'snack';
}

/** Human label for the Cook This eyebrow, e.g. "Cook this · tonight". */
export function mealtimeLabel(hour: number): string {
  if (hour < 11) return 'this morning';
  if (hour < 14) return 'for lunch';
  if (hour < 17) return 'this afternoon';
  if (hour < 21) return 'tonight';
  return 'right now';
}
