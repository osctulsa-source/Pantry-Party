# "Add something else you used" — cook sheet extra ingredients — design

**Date:** 2026-07-17
**Status:** Approved by user (conversation), pending spec review

The "I cooked this" sheet only ever offers rows for pantry items core's
matcher linked to the recipe's own ingredient list (plus an urgent-item
fallback when nothing matched). If a dish used something the recipe didn't
call for — a splash of an ingredient you improvised with — there's no way to
mark it used, so the pantry silently drifts from reality.

This is scoped to **this cook only**: it does not edit the recipe's
ingredient list, does not persist for next time, and does not change
`matchCookedItems`/`buildCookedSheetItems`/the recipe data model at all. It's
a sheet-local addition layered on top of the rows the matcher already
produced.

## 1. Sheet state: extra rows

**Where:** `apps/mobile/src/features/recipes/CookedItSheet.tsx`.

- The sheet already receives `items: CookedSheetItem[]` (matched + fallback
  rows) and derives per-item `actions` state from them. It gains a second
  piece of state, `extras: CookedSheetItem[]`, initialized empty, holding
  user-added rows for this confirmation only.
- The rendered row list becomes `[...items, ...extras]` — extras use the
  exact same row UI (name, ×qty badge, action chips) as matched rows, with
  one difference: no "recipe uses X" caption (nothing matched it, so there's
  nothing to attribute).
- `actions` state (`Record<itemId, CookAction>`) is keyed the same way for
  both; adding an extra also seeds its default action immediately via
  `defaultCookAction(item.quantity)` — the same rule already applied to every
  matched item (quantity > 1 → `use-some`, quantity = 1 → `use-up`).
- `onConfirm`'s write loop already iterates `items.filter(action !== 'keep')`
  and branches on `use-up` / `use-a-bit` / `use-some` — extras ride this
  unchanged once the loop iterates `[...items, ...extras]` instead of just
  `items`. No new write-path logic.

## 2. "Add something else you used" row + picker

**Where:** `CookedItSheet.tsx` (row + trigger), new
`apps/mobile/src/features/recipes/AddCookExtraSheet.tsx` (picker), new
`apps/mobile/src/features/recipes/filterAddableItems.ts` (pure filter, +
test).

- Below the item list (and below the "Nothing in your pantry to update"
  empty state, which this row also appears under — you can add an extra even
  when nothing auto-matched), a text-only row: **"+ Add something else you
  used"**.
- Tapping it opens `AddCookExtraSheet`, a second modal layered on top:
  a search `TextInput` over the household's full pantry
  (`usePantryItems()`, already available in both `RecipeDetailScreen` and
  `RecipesScreen` — passed down as a new `pantryItems: PantryItem[]` prop to
  `CookedItSheet`, which forwards it to `AddCookExtraSheet` only when opened).
- Pure filter function, extracted for testability:

```ts
// apps/mobile/src/features/recipes/filterAddableItems.ts
import type { PantryItem } from '@breadbox/core';

/**
 * Pantry items eligible for "Add something else you used": not already
 * showing as a row in the sheet (matched, fallback, or already added as an
 * extra), and matching the search query by substring (case-insensitive).
 */
export function filterAddableItems(
  pantry: PantryItem[],
  alreadyShownIds: ReadonlySet<string>,
  query: string,
): PantryItem[] {
  const q = query.trim().toLowerCase();
  return pantry
    .filter((p) => !alreadyShownIds.has(p.id))
    .filter((p) => q.length === 0 || p.name.toLowerCase().includes(q));
}
```

- `alreadyShownIds` is computed in `CookedItSheet` as
  `new Set([...items, ...extras].map((i) => i.itemId))` and passed down each
  time the picker opens, so an item already matched or already added can't be
  picked twice.
- Selecting a result: `AddCookExtraSheet` calls back with the chosen
  `PantryItem`; `CookedItSheet` appends it to `extras` as a
  `CookedSheetItem` (`matched: false`, `matchedIngredient: undefined`,
  `fillLevel` carried from the pantry item), seeds its default action, closes
  the picker.
- No results: "No matching pantry items" text, same tone as the sheet's
  existing empty state.

## 3. Removing an extra you added by mistake

No separate delete affordance. Setting an extra row's action to **Kept**
already means "no change" — identical in effect to never having added it
(the write loop skips `keep` actions, and `updateCount` already excludes
them). A dedicated × button was considered and rejected: it adds a second way
to reach the same "no-op" state and a disappearing-row interaction is more
surprising mid-sheet than a chip that's already there. If a user adds the
wrong item, tapping "Kept" is the same one-tap fix as backing out of any
other row's default action.

## 4. Testing

- **Mobile:** `filterAddableItems.test.ts` — excludes already-shown ids,
  case-insensitive substring match, empty query returns everything eligible,
  empty pantry / no matches returns `[]`.
- **On-device QA:** open "I cooked this" on a recipe with at least one
  matched item; add an extra pantry item via search; confirm its default
  action matches `defaultCookAction`'s rule for its quantity; confirm; verify
  the extra's pantry row actually changed (tombstoned / quantity decremented /
  fill level stepped, matching whichever action was left selected); confirm
  the same item can't be added twice; confirm the flow also works when the
  sheet's matched-items list is empty (fallback/no-match case).

## Out of scope

- No change to the recipe's own ingredient list, `usedIngredientNames`, or
  `matchCookedItems` — this is entirely a `CookedItSheet`-local addition.
- No free-text/non-pantry ingredient entry (spec question resolved: pantry
  search/pick only).
- No persistence of "items I usually add to this recipe" across cooks.
