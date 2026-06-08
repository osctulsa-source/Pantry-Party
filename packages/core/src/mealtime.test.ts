import { describe, it, expect } from 'vitest';

import { defaultMealForHour, mealtimeLabel } from './mealtime';

describe('defaultMealForHour', () => {
  it('maps hours to a sensible meal', () => {
    expect(defaultMealForHour(8)).toBe('breakfast');
    expect(defaultMealForHour(12)).toBe('main course');
    expect(defaultMealForHour(19)).toBe('main course');
    expect(defaultMealForHour(23)).toBe('snack');
    expect(defaultMealForHour(2)).toBe('breakfast');
  });
});

describe('mealtimeLabel', () => {
  it('describes the time of day', () => {
    expect(mealtimeLabel(8)).toBe('this morning');
    expect(mealtimeLabel(12)).toBe('for lunch');
    expect(mealtimeLabel(16)).toBe('this afternoon');
    expect(mealtimeLabel(19)).toBe('tonight');
    expect(mealtimeLabel(23)).toBe('right now');
  });
});
