import { formatAmount, scaleIngredients } from './scaleServings';
import { type RecipeIngredient } from '../../data/spoonacular/types';

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

describe('scaleIngredients', () => {
  const ing = (over: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
    name: 'chicken thighs',
    original: '1 lb boneless chicken thighs',
    amount: 1,
    unit: 'lb',
    ...over,
  });

  it('returns the same array reference when servings are unchanged', () => {
    const list = [ing()];
    expect(scaleIngredients(list, 4, 4)).toBe(list);
  });

  it('returns the same array reference when fromServings is not positive', () => {
    const list = [ing()];
    expect(scaleIngredients(list, 0, 4)).toBe(list);
  });

  it('scales amount by the servings ratio', () => {
    const [scaled] = scaleIngredients([ing({ amount: 1, unit: 'lb' })], 2, 4);
    expect(scaled.amount).toBe(2);
  });

  it('regenerates the leading number in original, keeping the rest of the text', () => {
    const [scaled] = scaleIngredients(
      [ing({ original: '1 lb boneless chicken thighs', amount: 1, unit: 'lb' })],
      2,
      3,
    );
    // 1 * 1.5 = 1.5 -> "1½"
    expect(scaled.original).toBe('1½ lb boneless chicken thighs');
  });

  it('snaps scaled amounts to the nearest quarter for display and original', () => {
    const [scaled] = scaleIngredients(
      [ing({ original: '1 cup flour', amount: 1, unit: 'cup', name: 'flour' })],
      3,
      4,
    );
    // 1 * (4/3) = 1.333... -> nearest quarter is 1.25 -> "1¼"
    expect(scaled.amount).toBeCloseTo(1.25, 5);
    expect(scaled.original).toBe('1¼ cup flour');
  });

  it('clamps a down-scaled amount that rounds to 0 up to the smallest unit', () => {
    const [scaled] = scaleIngredients(
      [ing({ original: '1 tsp red pepper flakes', amount: 1, unit: 'tsp', name: 'red pepper flakes' })],
      8,
      1,
    );
    // 1 * (1/8) = 0.125 -> rounds to 0 -> clamp to 0.25
    expect(scaled.amount).toBe(0.25);
    expect(scaled.original).toBe('¼ tsp red pepper flakes');
  });

  it('regenerates a space-separated mixed number without stranding the fraction', () => {
    const [scaled] = scaleIngredients(
      [ing({ original: '1 1/2 cups flour', amount: 1.5, unit: 'cup', name: 'flour' })],
      2,
      4,
    );
    // 1.5 * (4/2) = 3 -> "3 cup" (normalized unit), and the "1/2" must NOT
    // survive into the line (the bug produced "3 cup 1/2 cups flour").
    expect(scaled.amount).toBe(3);
    expect(scaled.original).toBe('3 cup flour');
  });

  it('handles a unicode mixed number ("1 ½") the same way', () => {
    const [scaled] = scaleIngredients(
      [ing({ original: '1 ½ cups sugar', amount: 1.5, unit: 'cup', name: 'sugar' })],
      2,
      4,
    );
    expect(scaled.original).toBe('3 cup sugar');
  });

  it('passes through ingredients with a null amount unchanged', () => {
    const salt = ing({ name: 'salt', original: 'salt to taste', amount: null, unit: '' });
    const [scaled] = scaleIngredients([salt], 2, 8);
    expect(scaled).toEqual(salt);
  });

  it('falls back to a generated line when original has no leading numeric token', () => {
    const [scaled] = scaleIngredients(
      [ing({ original: 'about a dozen garlic cloves', amount: 12, unit: '', name: 'garlic' })],
      4,
      2,
    );
    // 12 * 0.5 = 6, no confident leading-number match in "about a dozen..."
    expect(scaled.original).toBe('6 garlic');
  });
});
