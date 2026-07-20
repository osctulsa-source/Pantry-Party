# Servings Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick how many servings they're cooking for on the Recipe Detail screen, scaling displayed ingredient amounts (and Cook Mode's ingredient chips) to match.

**Architecture:** A new pure module `scaleServings.ts` exports `formatAmount` (extracted from `RecipeDetailScreen.tsx`, unchanged behavior) and a new `scaleIngredients()` function. `RecipeDetailScreen` adds a `servings` state, a `− N +` stepper replacing the read-only "Serves N" chip, and threads `scaleIngredients(...)` output into both its own ingredient list render and the `effectiveRecipe` object handed to `CookModeView` (which needs zero internal changes since it already just reads `recipe.ingredients`).

**Tech Stack:** React Native / Expo, TypeScript, Jest for unit tests.

---

## Task 1: Extract `formatAmount` into a shared pure module with tests

**Files:**
- Create: `apps/mobile/src/features/recipes/scaleServings.ts`
- Create: `apps/mobile/src/features/recipes/scaleServings.test.ts`
- Modify: `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx:99-131` (remove local `FRACTIONS`/`formatAmount`, import from new module)

This task only moves `formatAmount` (no behavior change) so Task 2 can build on it. Verifying it first, in isolation, means Task 2's new scaling logic is the only thing under test that's actually new.

- [ ] **Step 1: Write the failing test for the extracted `formatAmount`**

Create `apps/mobile/src/features/recipes/scaleServings.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/features/recipes/scaleServings.test.ts`
Expected: FAIL — `Cannot find module './scaleServings'`

- [ ] **Step 3: Create `scaleServings.ts` with `formatAmount` moved in verbatim**

Create `apps/mobile/src/features/recipes/scaleServings.ts`:

```ts
/**
 * Pure servings-scaling helpers for recipe ingredients. No React, no
 * side effects — safe to unit test directly and share between
 * RecipeDetailScreen (ingredient list) and CookModeView (via
 * effectiveRecipe, which already reads recipe.ingredients as-is).
 */
import type { RecipeIngredient } from '../../data/spoonacular/types';

const FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.67, '⅔'],
  [0.75, '¾'],
];

/**
 * A friendly amount string — "1½ cups", "2 tbsp", "¾" — so the food name can
 * lead the row and the fractions stay glanceable off to the side. Decimal
 * fractions map to the familiar unicode glyphs; null when there's no amount.
 */
export function formatAmount(amount: number | null, unit: string): string | null {
  if (amount === null || amount <= 0) return unit.trim() || null;
  const whole = Math.floor(amount);
  const frac = amount - whole;
  let fracGlyph = '';
  for (const [v, glyph] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.05) {
      fracGlyph = glyph;
      break;
    }
  }
  const num = fracGlyph
    ? whole > 0
      ? `${whole}${fracGlyph}`
      : fracGlyph
    : Number.isInteger(amount)
      ? `${amount}`
      : `${Math.round(amount * 100) / 100}`;
  const u = unit.trim();
  return u ? `${num} ${u}` : num;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/features/recipes/scaleServings.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Point `RecipeDetailScreen.tsx` at the shared `formatAmount`**

In `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx`, remove lines 104-131 (the local `FRACTIONS` const and `formatAmount` function) and add an import. The import block currently ends around line 63 with:

```ts
import { useTonightDevices } from './useTonightDevices';
import type { RootStackParamList } from '../../../App';
```

Change to:

```ts
import { useTonightDevices } from './useTonightDevices';
import { formatAmount } from './scaleServings';
import type { RootStackParamList } from '../../../App';
```

Then delete the now-duplicate block (originally lines 99-131):

```ts
/**
 * A friendly amount chip — "1½ cups", "2 tbsp", "¾" — so the food name can
 * lead the row and the fractions stay glanceable off to the side. Decimal
 * fractions map to the familiar unicode glyphs; null when there's no amount.
 */
const FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [0.33, '⅓'],
  [0.5, '½'],
  [0.67, '⅔'],
  [0.75, '¾'],
];
function formatAmount(amount: number | null, unit: string): string | null {
  if (amount === null || amount <= 0) return unit.trim() || null;
  const whole = Math.floor(amount);
  const frac = amount - whole;
  let fracGlyph = '';
  for (const [v, glyph] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.05) {
      fracGlyph = glyph;
      break;
    }
  }
  const num = fracGlyph
    ? whole > 0
      ? `${whole}${fracGlyph}`
      : fracGlyph
    : Number.isInteger(amount)
      ? `${amount}`
      : `${Math.round(amount * 100) / 100}`;
  const u = unit.trim();
  return u ? `${num} ${u}` : num;
}
```

Leave the rest of the file (the `Tag` function that follows) untouched.

- [ ] **Step 6: Typecheck and run the mobile test suite for this folder**

Run: `cd apps/mobile && npx tsc --noEmit -p . && npx jest src/features/recipes`
Expected: tsc reports no new errors; all existing recipe tests plus the new `scaleServings.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/recipes/scaleServings.ts apps/mobile/src/features/recipes/scaleServings.test.ts apps/mobile/src/features/recipes/RecipeDetailScreen.tsx
git commit -m "refactor(recipes): extract formatAmount into scaleServings.ts"
```

---

## Task 2: Add `scaleIngredients()` with tests

**Files:**
- Modify: `apps/mobile/src/features/recipes/scaleServings.ts` (add `scaleIngredients`)
- Modify: `apps/mobile/src/features/recipes/scaleServings.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/features/recipes/scaleServings.test.ts`:

```ts
import { formatAmount, scaleIngredients } from './scaleServings';
import type { RecipeIngredient } from '../../data/spoonacular/types';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/features/recipes/scaleServings.test.ts`
Expected: FAIL — `scaleIngredients` is not exported from `./scaleServings`

- [ ] **Step 3: Implement `scaleIngredients` in `scaleServings.ts`**

Append to `apps/mobile/src/features/recipes/scaleServings.ts` (after `formatAmount`):

```ts
/** Nearest-quarter snap used for scaled amounts, matching the fraction glyphs above. */
function snapToQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

// Matches a leading numeric/fraction token at the start of an `original`
// string: digits, decimal points, a slash (for "1/2"), unicode fraction
// glyphs, and the whitespace that follows — e.g. "1 lb", "1½ cups", "¾ cup".
const LEADING_NUMBER = /^[\d.\/½⅓⅔¼¾]+\s*/;

/**
 * Scales a recipe's ingredient list from one serving count to another.
 * Returns the same array reference (identity) when there's nothing to do,
 * so callers can memoize on the result safely.
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromServings: number,
  toServings: number,
): RecipeIngredient[] {
  if (fromServings <= 0 || fromServings === toServings) return ingredients;
  const ratio = toServings / fromServings;

  return ingredients.map((ing) => {
    if (ing.amount === null) return ing;

    const rawScaled = ing.amount * ratio;
    const snapped = snapToQuarter(rawScaled);
    const newAmount = snapped > 0 ? snapped : 0.25;

    const formatted = formatAmount(newAmount, ing.unit);
    const leadingMatch = LEADING_NUMBER.exec(ing.original);
    const newOriginal =
      leadingMatch !== null
        ? `${formatted ?? ''}${ing.original.slice(leadingMatch[0].length) ? ' ' : ''}${ing.original.slice(leadingMatch[0].length)}`.trim()
        : `${formatted ?? ''} ${ing.name}`.trim();

    return { ...ing, amount: newAmount, original: newOriginal };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/features/recipes/scaleServings.test.ts`
Expected: PASS (all `formatAmount` + `scaleIngredients` tests, 14 total)

If the `newOriginal` string-splicing logic produces off-by-one spacing (e.g.
`"1½lb..."` missing a space, or a double space), fix the join logic — the
formatted amount and the remainder must always be separated by exactly one
space. Re-run until PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/recipes/scaleServings.ts apps/mobile/src/features/recipes/scaleServings.test.ts
git commit -m "feat(recipes): add scaleIngredients for servings scaling"
```

---

## Task 3: Wire the servings stepper and scaled ingredients into `RecipeDetailScreen`

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx`

- [ ] **Step 1: Import `scaleIngredients` alongside `formatAmount`**

In the import block edited in Task 1 Step 5, change:

```ts
import { formatAmount } from './scaleServings';
```

to:

```ts
import { formatAmount, scaleIngredients } from './scaleServings';
```

- [ ] **Step 2: Add `servings` state, reset on recipe change**

Locate the existing state block (around what was originally line 196-204):

```ts
  const scrollRef = useRef<ScrollView>(null);
  const [cooking, setCooking] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [cookedCount, setCookedCount] = useState<number | null>(null);
  const [missingAdded, setMissingAdded] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [savedToast, setSavedToast] = useState<{ key: number } | null>(null);
  const [fetchedSteps, setFetchedSteps] = useState<RecipeInstructionGroup[] | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
```

Add a `servings` state right after it:

```ts
  const scrollRef = useRef<ScrollView>(null);
  const [cooking, setCooking] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [cookedCount, setCookedCount] = useState<number | null>(null);
  const [missingAdded, setMissingAdded] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [savedToast, setSavedToast] = useState<{ key: number } | null>(null);
  const [fetchedSteps, setFetchedSteps] = useState<RecipeInstructionGroup[] | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  // Screen-only serving count, scoped to this recipe view — resets whenever
  // a different recipe is opened (see the effect below), never persisted.
  const [servings, setServings] = useState(recipe.servings ?? 1);

  useEffect(() => {
    setServings(recipe.servings ?? 1);
  }, [recipe.id, recipe.servings]);

  const MIN_SERVINGS = 1;
  const MAX_SERVINGS = 12;

  function adjustServings(delta: number) {
    const next = servings + delta;
    if (next < MIN_SERVINGS || next > MAX_SERVINGS) return;
    Haptics.selectionAsync().catch(() => {});
    setServings(next);
  }
```

- [ ] **Step 3: Compute `scaledIngredients`**

Locate the `usedLc` memo (originally around line 231-234):

```ts
  const usedLc = useMemo(
    () => recipe.usedIngredientNames.map((n) => n.toLowerCase()),
    [recipe.usedIngredientNames],
  );
```

Add the scaling memo right after it:

```ts
  const usedLc = useMemo(
    () => recipe.usedIngredientNames.map((n) => n.toLowerCase()),
    [recipe.usedIngredientNames],
  );

  // Display-only scaling: amounts shown in the ingredient list and (via
  // effectiveRecipe below) Cook Mode's prep list + per-step chips. Pantry
  // matching (hasIngredient) and the shopping-list add stay name-based and
  // are unaffected by this — they never read `amount`.
  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, recipe.servings ?? 1, servings),
    [recipe.ingredients, recipe.servings, servings],
  );
```

- [ ] **Step 4: Feed `scaledIngredients` into the "have X of Y" bar and ingredient list**

Find `haveCount` (originally lines 239-243):

```ts
  const haveCount = useMemo(
    () => recipe.ingredients.filter((ing) => hasIngredient(usedLc, ing.name)).length,
    [recipe.ingredients, usedLc],
  );
  const haveLevel = recipe.ingredients.length > 0 ? haveCount / recipe.ingredients.length : 0;
```

Change both `recipe.ingredients` references to `scaledIngredients` (matching is name-based so behavior is identical, but this keeps one ingredient array driving the whole section instead of two parallel ones):

```ts
  const haveCount = useMemo(
    () => scaledIngredients.filter((ing) => hasIngredient(usedLc, ing.name)).length,
    [scaledIngredients, usedLc],
  );
  const haveLevel = scaledIngredients.length > 0 ? haveCount / scaledIngredients.length : 0;
```

Find `swapsByIngredient` (originally lines 255-264):

```ts
  const swapsByIngredient = useMemo(() => {
    const missingNames = recipe.ingredients
      .filter((ing) => !hasIngredient(usedLc, ing.name))
      .map((ing) => ing.name);
    const swaps = suggestSubstitutes(
      missingNames,
      items.map((i) => ({ id: i.id, name: i.name })),
    );
    return new Map(swaps.map((s) => [s.missingIngredient.toLowerCase(), s]));
  }, [recipe.ingredients, usedLc, items]);
```

Change to:

```ts
  const swapsByIngredient = useMemo(() => {
    const missingNames = scaledIngredients
      .filter((ing) => !hasIngredient(usedLc, ing.name))
      .map((ing) => ing.name);
    const swaps = suggestSubstitutes(
      missingNames,
      items.map((i) => ({ id: i.id, name: i.name })),
    );
    return new Map(swaps.map((s) => [s.missingIngredient.toLowerCase(), s]));
  }, [scaledIngredients, usedLc, items]);
```

In the JSX ingredient list render, find (originally lines 440-441 and 463):

```ts
          {recipe.ingredients.length > 0 ? (
```
and
```ts
                {recipe.ingredients.map((ing, idx) => {
```

Change both to `scaledIngredients`:

```ts
          {scaledIngredients.length > 0 ? (
```
```ts
                {scaledIngredients.map((ing, idx) => {
```

Also update the count display right after (originally lines 445-446):

```ts
                  You have <Text style={styles.ingSummaryStrong}>{haveCount}</Text> of{' '}
                  <Text style={styles.ingSummaryStrong}>{recipe.ingredients.length}</Text>
```

to:

```ts
                  You have <Text style={styles.ingSummaryStrong}>{haveCount}</Text> of{' '}
                  <Text style={styles.ingSummaryStrong}>{scaledIngredients.length}</Text>
```

- [ ] **Step 5: Feed `scaledIngredients` into `effectiveRecipe` for Cook Mode**

Find `effectiveRecipe` (originally lines 325-336):

```ts
  const effectiveRecipe = useMemo(() => {
    if (activeVariant) {
      return {
        ...recipe,
        instructions: [{ name: '', steps: activeVariant.steps }],
        readyInMinutes: activeVariant.readyInMinutes,
      };
    }
    return recipe.instructions.length === 0 && fetchedSteps
      ? { ...recipe, instructions: fetchedSteps }
      : recipe;
  }, [recipe, fetchedSteps, activeVariant]);
```

Change to also apply `scaledIngredients`:

```ts
  const effectiveRecipe = useMemo(() => {
    const base =
      recipe.instructions.length === 0 && fetchedSteps
        ? { ...recipe, instructions: fetchedSteps }
        : recipe;
    const withScaledIngredients = { ...base, ingredients: scaledIngredients };
    if (activeVariant) {
      return {
        ...withScaledIngredients,
        instructions: [{ name: '', steps: activeVariant.steps }],
        readyInMinutes: activeVariant.readyInMinutes,
      };
    }
    return withScaledIngredients;
  }, [recipe, fetchedSteps, activeVariant, scaledIngredients]);
```

- [ ] **Step 6: Replace the read-only "Serves N" meta chip with the stepper**

Find the meta chip block (originally lines 405-428):

```ts
          {(displayMinutes !== null || recipe.servings !== null || showHealth) && (
            <View style={styles.metaRow}>
              {displayMinutes !== null && (
                <View style={styles.metaChip}>
                  <Clock size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>{displayMinutes} min</Text>
                </View>
              )}
              {recipe.servings !== null && (
                <View style={styles.metaChip}>
                  <Users size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>Serves {recipe.servings}</Text>
                </View>
              )}
              {showHealth && (
                <View style={styles.metaChip}>
                  <Leaf size={13} color={tokens.color.success} />
                  <Text style={[styles.metaTxt, { color: tokens.color.success }]}>
                    {(recipe.healthScore ?? 0) >= 70 ? 'Very healthy' : 'Healthy'} · {recipe.healthScore}
                  </Text>
                </View>
              )}
            </View>
          )}
```

Replace the `recipe.servings !== null` chip with a stepper, keeping the rest identical:

```ts
          {(displayMinutes !== null || recipe.servings !== null || showHealth) && (
            <View style={styles.metaRow}>
              {displayMinutes !== null && (
                <View style={styles.metaChip}>
                  <Clock size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>{displayMinutes} min</Text>
                </View>
              )}
              {recipe.servings !== null && (
                <View style={styles.servingsStepper}>
                  <Users size={13} color={tokens.color.inkMuted} />
                  <Pressable
                    style={[styles.stepperBtn, servings <= MIN_SERVINGS && styles.stepperBtnDisabled]}
                    onPress={() => adjustServings(-1)}
                    disabled={servings <= MIN_SERVINGS}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease servings"
                  >
                    <Text style={styles.stepperBtnTxt}>−</Text>
                  </Pressable>
                  <Text style={styles.metaTxt} accessibilityLabel={`Serves ${servings}`}>
                    Serves {servings}
                  </Text>
                  <Pressable
                    style={[styles.stepperBtn, servings >= MAX_SERVINGS && styles.stepperBtnDisabled]}
                    onPress={() => adjustServings(1)}
                    disabled={servings >= MAX_SERVINGS}
                    accessibilityRole="button"
                    accessibilityLabel="Increase servings"
                  >
                    <Text style={styles.stepperBtnTxt}>+</Text>
                  </Pressable>
                </View>
              )}
              {showHealth && (
                <View style={styles.metaChip}>
                  <Leaf size={13} color={tokens.color.success} />
                  <Text style={[styles.metaTxt, { color: tokens.color.success }]}>
                    {(recipe.healthScore ?? 0) >= 70 ? 'Very healthy' : 'Healthy'} · {recipe.healthScore}
                  </Text>
                </View>
              )}
            </View>
          )}
```

- [ ] **Step 7: Add the stepper styles**

Find the `metaChip` style definition (originally lines 819-827):

```ts
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
```

Add new styles right after it:

```ts
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  servingsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(2),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnTxt: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 15,
    lineHeight: 15,
    color: tokens.color.accent,
  },
```

- [ ] **Step 8: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no new errors. Fix any remaining `recipe.ingredients` references in this file that should now read `scaledIngredients` (search the file for `recipe.ingredients` — the only remaining uses should be inside the `scaledIngredients`/`effectiveRecipe` memos themselves and the empty-instructions backfill check, which are correct as-is since they need the original unscaled data).

- [ ] **Step 9: Manual verification on device/simulator**

Run: `cd apps/mobile && npx expo start` (or the project's existing `run` skill/workflow), open a curated recipe with known servings (e.g. 4) and ingredient amounts, and check:
- The stepper shows `− Serves 4 +`.
- Tapping `+` three times shows `Serves 7`; the ingredient amount chips and `original` text below each ingredient update (e.g. "1 lb boneless chicken thighs" scales up).
- Tapping `−` down to 1 disables further decrease; up to 12 disables further increase.
- Tap "Start cooking" — Cook Mode's "Gather these" list and the per-step "For this step" chips show the same scaled amounts.
- "You have X of Y" and "Add missing to list" still work and are unaffected by the serving count.
- Navigate back and reopen the same recipe — servings resets to the recipe's default (no persistence).

- [ ] **Step 10: Run full recipe test suite once more**

Run: `cd apps/mobile && npx jest src/features/recipes`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipeDetailScreen.tsx
git commit -m "feat(recipes): servings stepper scales ingredient amounts in detail + cook mode"
```

---

## Self-Review Notes

- **Spec coverage:** stepper placement/bounds (Task 3 Step 6-7), screen-only reset (Task 3 Step 2), fraction-snapped scaling (Task 2), `original` text regeneration with fallback (Task 2), Cook Mode inheriting scaled amounts via `effectiveRecipe` (Task 3 Step 5), pantry/shopping-list left untouched (Task 3 Step 4 comment + no changes to `onAddMissing`/`addToShoppingList`) — all covered.
- **No placeholders:** every step includes literal code/commands.
- **Type consistency:** `RecipeIngredient` fields (`name`, `original`, `amount`, `unit`) match `apps/mobile/src/data/spoonacular/types.ts:7-12` throughout; `scaleIngredients(ingredients, fromServings, toServings)` signature is identical everywhere it's called (Task 2 definition, Task 3 Step 3 usage).
