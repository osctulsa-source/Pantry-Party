# "Use It Up" Recipe Ranking + Shopping-List Name Casing — Design

**Date:** 2026-07-10
**Status:** Approved (Approach A)
**Branch:** feat/use-it-up-ranking (off `feat/shelf-life-db` follow-on work; independent of the shelf-life dataset itself)

## Problem

1. **Expiry doesn't influence recipe ranking.** The Cook tab ranks recipes by a
   taste + pantry-match blend (`RecipesScreen.tsx` `pool` memo), but a recipe
   that uses the chicken expiring tomorrow ranks no higher than one that
   doesn't. Expiry currently only powers the header reason line ("Because your
   milk expires soon"). The whole product loop is capture → expiry → cook;
   ranking is where expiry should pay off.

2. **Bug: recipe → shopping-list adds are all lowercase.** Ingredient names
   arrive lowercase from both the Spoonacular client and the curated recipe
   matcher. Both "Add missing ingredients" handlers pass them straight through,
   so the shopping list shows "olive oil", "chicken breast".

## Decisions (user-confirmed)

- Ranking presentation: **boost + badge** — urgency folds into the existing
  blend score AND cards show an explanatory "Use it up" line. No dedicated
  section, no silent-only boost.
- Shopping-list casing: **Title Case** ("Olive Oil", "Cream of Tartar").

## Design

### 1. Core module: `packages/core/src/useItUp.ts`

Pure functions, no I/O — same pattern as every other ranking/matching module
in core.

```ts
export interface UrgentMatch {
  itemName: string;          // pantry item's display name
  daysLeft: number;          // floor of days until expiry; negative if expired
  status: 'expired' | 'warning' | 'soon'; // soon = 4–7 days out
}

export function scoreUseItUp(
  usedIngredientNames: string[],
  pantryItems: Array<{ name: string; expiresAt?: string }>,
  now: Date,
): { score: number; urgentMatches: UrgentMatch[] };

export function formatUseItUpBadge(matches: UrgentMatch[]): string | null;
```

- **Matching:** reuse `normalizeFoodTokens` from `cooked.ts` on both the
  ingredient names and pantry names — token overlap means a match. Consistency
  with the cooked-it matcher is deliberate: the same recipe/pantry pair should
  match in both features.
- **Weights per matched pantry item** (from days until expiry, computed
  timestamp-based like `getExpiryStatus`):
  - expired: **2**
  - 0–1 days left: **3**
  - 2–3 days left (warning window): **2**
  - 4–7 days left: **1**
  - > 7 days or no/invalid `expiresAt`: **0**
- Multiple urgent matches **sum, capped at 6** so one recipe can't run away
  from the taste signal.
- Each pantry item counts **once** per recipe even if several ingredients
  match it. `urgentMatches` is sorted most-urgent-first (fewest days left).
- **Badge text** (`formatUseItUpBadge`):
  - no matches → `null`
  - expired: `Use it up: chicken · expired`
  - 0 days: `Use it up: chicken · expires today`, 1 day: `· 1 day left`,
    else `· N days left`
  - multiple matches: append ` +1 more` / ` +2 more` after the most urgent.
  - Item names rendered lowercase in the badge (matches the existing header
    reason line style: "Because your milk…").

### 2. Cook tab wiring (`apps/mobile/src/features/recipes/RecipesScreen.tsx`)

- Memoize per-recipe results: `useItUpByRecipe: Map<recipeId, {score, urgentMatches}>`
  computed from `recipes` + `items` + `now` (the existing pantry-anchored `now`).
- Add to the existing `blend()`:
  `+ (useItUpByRecipe.get(r.id)?.score ?? 0)` — weight 1× per urgency point,
  comparable to `usedIngredientCount`, so it shifts ties/near-ties without
  overpowering taste.
- **Badge rendering:** hero card and alternate rows show the
  `formatUseItUpBadge` line when non-null, styled with the expiry warning
  semantic token (same convention as `reasonColor`); expired-driven badges use
  the expired token.
- No change to the fetch/pagination path — scoring is client-side over the
  already-fetched page, zero extra quota, works offline (curated recipes
  score identically).

### 3. Bug fix: Title Case for recipe → shopping-list adds

- New pure helper in `packages/core/src/shoppingList.ts`:
  `titleCaseIngredient(name: string): string`
  - Capitalizes the first letter of each word.
  - Small words stay lowercase when not first: of, and, the, with, in, for, a
    ("Cream of Tartar").
  - Words that already contain an uppercase letter are left untouched
    ("Parmesan", "BBQ sauce" → "BBQ Sauce").
  - Trims/collapses interior whitespace.
- Applied at the two recipe-add call sites (`RecipesScreen.tsx onAddMissing`,
  `RecipeDetailScreen.tsx onAddMissing`) — NOT inside `addToShoppingList`, so
  manual adds keep the user's own casing. Dedupe in `addToShoppingList` is
  already case-insensitive; no behavior change there.

### 4. Testing

- `packages/core/src/useItUp.test.ts`: matching via token normalization
  (plural folding, stop-word phrases), each weight band, the per-item
  dedupe, the cap at 6, sort order of `urgentMatches`, badge strings for
  each band and for multiples, empty/no-expiry pantry → score 0 and null
  badge, invalid `expiresAt` treated as fresh.
- `shoppingList` tests: `titleCaseIngredient` cases — plain lowercase,
  small words, existing capitals, whitespace, single word, empty string.
- Mobile: existing jest-expo suite must stay green; no new screen-level
  tests required (badge is a pure-text render of a tested core function).

## Out of scope (YAGNI)

- No dedicated "Use it up" section/row.
- No notification or shelf-life dataset changes.
- No server/API changes; entirely client-side.
- No re-casing of existing shopping-list rows already in the database.
