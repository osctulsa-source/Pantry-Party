# Diet & allergy onboarding step + recipe filtering — design

**Date:** 2026-07-13
**Status:** design approved in session; spec pending user review
**Scope:** sub-project 2 of 3 (illustrated tile pickers). Staple tiles shipped in #177; cook-device tiles are sub-project 3.

## Goal

A first-run onboarding step — "Do you follow any diets? Any allergies?" — rendered as Direction-B
BrandTiles, feeding the existing `TasteProfile`, plus the diet **filtering** that the taste-profile
system promised ("captured for filtering, applied elsewhere") but never delivered: recipes violating a
selected diet or allergy are hidden from Cook-tab suggestions.

## Decisions (user-approved)

- **Storage:** extend the existing per-household `TasteProfile` (AsyncStorage via `useTasteProfile`) —
  no new store, onboarding and the Taste Quiz stay in sync by construction.
- **Filtering:** hard-hide violations from suggestion surfaces ("filters, not nudges", per
  `tasteProfile.ts`'s own doc). Favorites and recipe detail are never filtered — explicit saves stay
  visible.

## Non-goals

- Pescatarian / paleo / keto / low-carb — no recipe data to back them; dishonest checkboxes are worse
  than absent ones. Revisit with data enrichment.
- Per-user (vs per-household) preferences; cloud sync of the profile.
- Allergen enrichment of the curated recipe catalog.
- Cook-device tiles (sub-project 3).

## 1 · Core — `packages/core/src/dietFilter.ts`

New pure module (pattern: `useItUp.ts`, `cookingDevice.ts`), plus a small `tasteProfile.ts` extension.

### TasteProfile extension (`tasteProfile.ts`)

- `TasteProfile` gains `allergies: string[]` (slugs from `ALLERGY_OPTIONS`). `EMPTY_TASTE_PROFILE`
  gains `allergies: []`.
- Backward compatibility: `useTasteProfile` already spreads parsed JSON over the empty profile
  (verify — if it assigns raw parse, add `{ ...EMPTY_TASTE_PROFILE, ...parsed }`), so stored profiles
  without the field load as `[]`.
- New catalog:

```ts
export const ALLERGY_OPTIONS: TasteOption[] = [
  { slug: 'egg', label: 'Egg' },
  { slug: 'soy', label: 'Soy' },
  { slug: 'fish', label: 'Fish' },
  { slug: 'shellfish', label: 'Shellfish' },
];
```

(Peanut/tree-nut are represented by the existing `nut-free` diet line; sesame deferred — YAGNI.)

### dietFilter.ts

```ts
export interface DietCheckRecipe {
  vegetarian?: boolean | null;
  vegan?: boolean | null;
  glutenFree?: boolean | null;
  /** Lowercased ingredient names (caller maps from its recipe shape). */
  ingredientNames: string[];
}

/** Slugs from profile.diets + profile.allergies the recipe violates. */
export function recipeViolations(profile: TasteProfile, recipe: DietCheckRecipe): string[];

/** Recipes with zero violations. Empty profile returns the input array unchanged (same reference). */
export function filterByDiet<T extends DietCheckRecipe>(profile: TasteProfile, recipes: T[]): T[];
```

Rules:

- **Flag-backed diets** — `vegetarian`, `vegan`, `gluten-free`: violation unless the matching recipe
  flag is strictly `true`. Missing/null flags count as violations (hide-when-unsure is the safe
  direction for a hard dietary line; both curated and Spoonacular recipes carry these flags, so in
  practice this only bites malformed data).
- **Keyword-backed lines** — `dairy-free`, `nut-free`, and the four allergens: violation when any
  ingredient name contains a deny-list keyword (substring match on lowercased names). Deny-lists are
  exported constants, conservative and word-based, e.g.:
  - dairy: milk, butter, cheese, cream, yogurt, ghee, mozzarella, parmesan, cheddar, feta, ricotta
  - nut: peanut, almond, cashew, walnut, pecan, pistachio, hazelnut, macadamia, nut butter
    (NOT bare "nut" — "nutmeg"/"butternut" false-positives; use word-ish keywords)
  - egg: egg, eggs, mayonnaise, mayo, aioli
  - soy: soy, tofu, edamame, tempeh, miso, tamari
  - fish: salmon, tuna, cod, tilapia, anchov, sardine, halibut, trout, fish sauce, fish
  - shellfish: shrimp, prawn, crab, lobster, scallop, clam, mussel, oyster
- `vegan` selected implies the dairy and egg checks too (vegan flag `true` should already guarantee
  it, but the keyword check backstops flag errors — belt and suspenders, cheap).
- Empty `diets` + `allergies` → `filterByDiet` returns the input array by reference (guarantees zero
  behavior change for users who never touched the feature).

Tests (`dietFilter.test.ts`): flag pass/fail/missing per diet; each keyword list hits and near-miss
("nutmeg" passes nut-free, "butternut squash" passes); vegan backstop; empty-profile passthrough
(reference equality); multi-violation returns all slugs.

## 2 · Three new glyphs (family 49 → 52)

Same construction rule, added to `brandGlyphs.pantry.tsx` (union + record + tone):

| Glyph | Silhouette sketch | Tone |
|---|---|---|
| `wheat` | Two grain heads on stalks, awn cut-marks | ochre |
| `peanut` | Waisted shell, cross-hatch cut dimples | cocoa |
| `shrimp` | Curled body, segment cut-lines, tail fan | brick |

The glyph/tone completeness test covers them automatically.

### Tile art mapping (in the new step's module, `dietArt.ts` beside the screen)

- Diets: vegetarian→`carrot`, vegan→`herb`, gluten-free→`wheat`, dairy-free→`milkjug`, nut-free→`peanut`
- Allergies: egg→`egg`, soy→`soybottle`, fish→`fish`, shellfish→`shrimp`
- No glyph is used twice on this screen (the per-grid no-sharing rule); reuse across other screens
  (staples picker) is fine. A tiny test asserts the mapping covers every `DIET_OPTIONS` +
  `ALLERGY_OPTIONS` slug uniquely.

## 3 · Onboarding — two steps

`OnboardingScreen` becomes a two-step flow (local step state; no navigator changes — it stays the
single AppRoot-gated screen):

- **Step 1 (new): `DietStep`** — own component file beside OnboardingScreen. Hero-less, compact:
  progress dots (1 of 2), title "Do you follow any diets?", hint "We'll hide recipes that don't fit.
  You can change this anytime in Your Kitchen." Two BrandTile grids (4-col, same cell math as
  QuickAddStaples): DIET_OPTIONS then a "Any allergies?" section with ALLERGY_OPTIONS. Multi-select
  toggles (tiles flip selected/✓ and stay tappable — unlike staples, selection here is reversible).
  Footer: "Continue" (always enabled — zero selections is a valid answer) + no separate skip (Continue
  with nothing selected IS skip; fewer paths).
- **Step 2: existing stock-your-pantry content**, untouched except the progress indicator (2 of 2)
  and its existing Continue/Skip semantics.
- **Saving:** on step-1 Continue, merge `{ diets, allergies, updatedAt: nowISO }` into the loaded
  profile via `useTasteProfile(activeHouseholdId).save` — cuisines/flavors/speed preserved. If
  `activeHouseholdId` is still null (the known first-moment race), hold the selections in state and
  save when it resolves (effect), mirroring the screen's existing household-readiness guard; worst
  case (user quits mid-race) the answers are droppable — onboarding data is re-enterable in the quiz.
- **BrandTile reuse:** selected-but-tappable is already supported (`selected` without `disabled`).

### Taste Quiz parity

`TasteQuizSheet` step 3 gains an "Allergies" chip row (same chip UI it already uses for diets)
reading `ALLERGY_OPTIONS`, wired into its local state + returned profile. Keeps the two surfaces
editing the same fields.

## 4 · Filtering application — Cook tab only

In `RecipesScreen`, apply `filterByDiet(tasteProfile, recipes)` to the candidate pool before the
existing ranking/urgency blends (single site — the memoized candidates step), mapping each recipe to
`DietCheckRecipe` via its existing fields (`vegetarian/vegan/glutenFree` + lowercased
`extendedIngredients`/curated ingredient names). Hero cards and "More from your pantry" both flow
from that pool. Favorites, cook history, recipe detail: untouched.

Edge note: if filtering empties the pool entirely (aggressive profile + small fetch), show the
existing empty state — acceptable for v1 and honest; noted in QA.

## 5 · Testing & verification

- Core: `dietFilter.test.ts` as §1; `tasteProfile.test.ts` extended for the new field default.
- Mobile: `DietStep.test.tsx` (renders both sections, toggle flips a11y selected state, Continue
  fires with selections), `dietArt.test.ts` (unique, complete). Existing suites stay green.
- Commands: root `npm run lint`, `apps/mobile` `npx tsc --noEmit` + `npx jest`, core workspace vitest.
- Manual QA (needs dev build): fresh-user onboarding both steps; skip path; quiz shows same answers;
  vegetarian hides meat recipes on Cook; shellfish allergy hides shrimp recipes; empty profile
  changes nothing; dark mode + VoiceOver pass.

## 6 · Delivery

Branch `feat/diet-allergy-onboarding` (worktree `../Pantry-Party-diet`, off main at `f45ced6` which
includes #177's BrandTile + glyph family). Single PR.

**Known collision to manage at merge time:** the in-flight lazy-kitchen session's uncommitted edits
in the main checkout touch `OnboardingScreen.tsx` (a one-line change) — this spec rewrites that file
into the two-step flow, so whichever lands second takes a small conflict there. `RecipesScreen` has
no uncommitted foreign edits (verified at spec time); the rest of this spec's files
(tasteProfile/dietFilter/DietStep/TasteQuizSheet) don't overlap that session at all.
