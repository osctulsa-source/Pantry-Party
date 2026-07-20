# Servings scaling — design

## Problem

Recipe detail shows a fixed "Serves N" chip. Users want to pick how many
servings they're cooking for and have ingredient amounts scale to match.
Feedback item: "a user should be able to pick how many servings they are
wanting to cook for, and have the recipes change the amounts based off
selection."

## Scope

- Recipe Detail screen: replace the static "Serves N" meta chip with a
  `− N +` stepper, bounded 1–12 (matches `servings: number; // 1-12` in the
  curated recipe schema, `data/recipes/SPEC.md`).
- Scaling is **screen-only, session state** — no persistence. Picking a
  count on one visit doesn't survive navigating away and back; reopening a
  recipe always starts at its authored `recipe.servings`.
- Scaling affects **ingredient amount display only**:
  - The Ingredients section list (amount chip + the `original` text line).
  - Cook Mode's "Gather these" prep checklist and per-step "For this step"
    ingredient chips (both already read straight off `recipe.ingredients`
    via the `effectiveRecipe` object passed into `CookModeView`).
- Out of scope (explicitly, per requirements discussion):
  - Pantry "have X of Y" matching — already name-based, unaffected.
  - "Add missing to shopping list" — stays name-only, no quantities.
  - readyInMinutes, instructions text, equipment lists — unchanged.
  - Any persistence (AsyncStorage, `useRecipePrefs`, household default).

## Data flow

`RecipeDetailScreen` already computes `effectiveRecipe` (recipe with device
variant / backfilled instructions swapped in) and passes it to
`CookModeView`. This design adds one more transform in that same pipeline:

```
recipe.ingredients (base, at recipe.servings)
        │
        ▼
scaleIngredients(ingredients, recipe.servings, servings)   // new pure fn
        │
        ▼
scaledIngredients
        │
        ├─→ Ingredients section list (RecipeDetailScreen render)
        └─→ effectiveRecipe.ingredients ─→ CookModeView (unchanged internals)
```

## New module: `scaleServings.ts`

Location: `apps/mobile/src/features/recipes/scaleServings.ts`, unit-tested
alongside the other pure modules in that folder (`cookTimers.ts`,
`matchTechnique.ts` are the existing pattern — pure functions + `.test.ts`).

```ts
function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromServings: number,
  toServings: number,
): RecipeIngredient[]
```

Behavior:
- If `fromServings === toServings` or `fromServings <= 0`, return the input
  array unchanged (identity — avoids float noise at the default state and
  guards against malformed recipe data).
- Ratio = `toServings / fromServings`.
- For each ingredient:
  - `amount: null` (to-taste / count items like "a pinch of red pepper
    flakes") → pass through unchanged, `original` unchanged.
  - `amount: number` → `newAmount = amount * ratio`, snapped to the nearest
    quarter (0.25) for display, matching the existing fraction-glyph table
    in `RecipeDetailScreen.tsx`'s `formatAmount`. Floor at a sane minimum
    (e.g. don't display `0`) — if scaling rounds to 0, clamp to the smallest
    representable unit (0.25) rather than dropping the ingredient.
  - `original`: regenerate the leading quantity token. `original` strings
    start with the number Spoonacular/curated authoring wrote (e.g. `"1 lb
    boneless chicken thighs"`, `"4 cloves garlic, minced"`). Replace via a
    regex matching a leading numeric/fraction token
    (`/^[\d.\/½⅓⅔¼¾\s]+/`) with the newly formatted amount+unit, keeping
    the remainder of the string intact. If the regex doesn't confidently
    match (original doesn't start with a number — rare, but possible for
    hand-authored strings that lead with a word), fall back to `${name}`
    prefixed by the formatted amount instead of mangling the string.
- `formatAmount`'s fraction-snap + glyph logic gets factored out of
  `RecipeDetailScreen.tsx` into a shared helper (e.g. exported from
  `scaleServings.ts` or a small `formatAmount.ts`) so both the scaler and
  the existing display code use one implementation. `RecipeDetailScreen`
  imports it instead of keeping its private copy.

## UI changes — `RecipeDetailScreen.tsx`

- New state: `const [servings, setServings] = useState(recipe.servings ?? 1)`.
  Reset via a `useEffect` keyed on `recipe.id` (mirrors the existing
  `deviceTouched` reset pattern) so navigating between recipes doesn't leak
  a previous scaling choice.
- Replace the existing read-only `Users` meta chip with a stepper:
  `[−]  Serves {servings}  [+]`. Same chip visual language
  (`styles.metaChip`), `−`/`+` as small `Pressable` hit targets (24×24ish,
  matching existing icon button sizing elsewhere on the screen).
  - Disabled/no-op at the 1 floor and 12 ceiling (buttons dim, no haptic).
  - `Haptics.selectionAsync()` on each successful tap, consistent with
    `selectDevice`.
  - Accessibility: `accessibilityRole="button"`, labels "Decrease servings"
    / "Increase servings", and the count itself gets
    `accessibilityLabel={`Serves ${servings}`}` with `accessibilityLiveRegion="polite"`
    isn't necessary — VoiceOver users will hear the updated button labels
    on next focus, consistent with how the device chips work today.
  - Only render the stepper when `recipe.servings !== null` (mirrors the
    existing conditional that only shows the chip when servings is known).
- `scaledIngredients = useMemo(() => scaleIngredients(recipe.ingredients, recipe.servings ?? 1, servings), [recipe.ingredients, recipe.servings, servings])`.
- Replace `recipe.ingredients` with `scaledIngredients` in:
  - The "You have X of Y" bar — **note**: this count is name-matching only
    (`hasIngredient`), so swapping the array is a no-op for the count logic
    but keeps the row rendering source consistent (avoids maintaining two
    parallel ingredient arrays for render vs. match).
  - The ingredient list `.map()` render.
- `effectiveRecipe` gets `ingredients: scaledIngredients` merged in (in
  addition to its existing variant/backfill logic), so `CookModeView`
  receives scaled amounts automatically. No changes inside
  `CookModeView.tsx`.

## Edge cases

- Recipe with `servings === null` (older cached payload): stepper doesn't
  render at all (existing conditional already guards the meta chip on
  `recipe.servings !== null`); ingredients render unscaled as today.
- Device variant switch (`activeDevice`) is independent of servings —
  scaling applies uniformly regardless of which instruction variant is
  active, since only `recipe.ingredients` (not variant steps) carries
  amounts.
- Switching servings does **not** reset `doneSteps` (unlike device
  switching) — the step list itself doesn't change, only ingredient
  amounts shown in Cook Mode/detail, so checked-off progress should
  survive.

## Testing

- `scaleServings.test.ts`: ratio math, null-amount passthrough, fraction
  snapping (including the "rounds to 0 → clamp to 0.25" case), `original`
  regex replacement (numeric leads, fraction-glyph leads, and the
  no-confident-match fallback), identity when `from === to`.
- Manual/on-device: verify stepper bounds, Cook Mode reflects scaled
  amounts, "You have X of Y" and shopping list stay unaffected by scaling.
