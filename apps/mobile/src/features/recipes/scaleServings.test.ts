import { formatAmount } from './scaleServings';

describe('formatAmount', () => {
  it('formats whole numbers with unit', () => {
    expect(formatAmount(4, 'tbsp')).toBe('4 tbsp');
  });
  it('formats fraction glyphs for common fractions', () => {
    expect(formatAmount(0.5, 'cup')).toBe('½ cup');
    expect(formatAmount(1.5, 'cup')).toBe('1½ cup');
    expect(formatAmount(0.25, 'tsp')).toBe('¼ tsp');
    expect(formatAmount(0.75, '')).toBe('¾');
  });
  it('falls back to rounded decimal for non-standard fractions', () => {
    expect(formatAmount(1.1, 'lb')).toBe('1.1 lb');
  });
  it('returns unit alone (or null) when amount is null', () => {
    expect(formatAmount(null, 'tsp')).toBe('tsp');
    expect(formatAmount(null, '')).toBeNull();
  });
  it('returns unit alone when amount is zero or negative', () => {
    expect(formatAmount(0, 'cup')).toBe('cup');
    expect(formatAmount(-1, 'cup')).toBe('cup');
  });
});
