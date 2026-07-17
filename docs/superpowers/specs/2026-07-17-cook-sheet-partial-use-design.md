# "Used a little" — partial use in the cook sheet — design

**Date:** 2026-07-17
**Status:** Approved by user (conversation), pending spec review

Today's "I cooked this" sheet (`CookedItSheet`) offers three actions per
matched pantry item: Used up (tombstone), −1 (quantity decrement, only shown
when `quantity > 1`), and Kept. That doesn't fit single-count items that get
partially consumed by a recipe without being anywhere near empty — a bottle
of fish sauce, a jug of olive oil, a jar of roasted garlic. The user
explicitly doesn't want to be asked for exact measurements.

The schema already has the right primitive for this: `fillLevel` (0–1, only
ever set to 1/0.75/0.5/0.25), already used for the pantry row's manual
"tap to set lower" fill bar. This feature reuses it from the cook sheet.

## 1. Core: fourth cook action + shared fill ladder

**Where:** `packages/core/src/cooked.ts` + `cooked.test.ts`.

- `CookAction` gains `'use-a-bit'`.
- New pure function, extracted from `PantryScreen.cycleFill`'s inline ladder
  (that call site is refactored to use it — no behavior change there):

```ts
/**
 * One step down the Full → ¾ → ½ → ¼ ladder. Floors at ¼ — "used up" is the
 * honest path to empty, this never implies zero. Undefined (never set)
 * behaves as Full, matching the pantry row's display convention.
 */
export function steppedFillLevel(current: number | undefined): number {
  const level = current ?? 1;
  if (level > 0.75) return 0.75;
  if (level > 0.5) return 0.5;
  return 0.25;
}
```

- `defaultCookAction` is unchanged — "Used a little" is never auto-suggested
  (we can't infer partial-use intent from quantity alone); it's an action the
  user actively picks.

**Tests:** ladder steps 1→0.75→0.5→0.25→0.25 (floors, doesn't wrap to 1 —
deliberately different from the pantry row's cycle, which wraps; see §3);
undefined → 0.75 (treated as Full, one step down).

## 2. Thread `fillLevel` into the cook sheet's data

**Where:** `apps/mobile/src/features/recipes/buildCookedSheetItems.ts`,
`apps/mobile/src/features/recipes/CookedItSheet.tsx`.

- `CookedSheetItemRow` (build helper) and `CookedSheetItem` (sheet prop type)
  both gain `fillLevel: number | undefined`, populated from the source
  `PantryItem.fillLevel` in `buildCookedSheetItems` (matched-items branch and
  fallback branch both carry it through).

## 3. Cook sheet UI + write path

**Where:** `apps/mobile/src/features/recipes/CookedItSheet.tsx`.

- A 4th `Choice` chip, **"Used a little"**, appears on every row (regardless
  of quantity — unlike today's `−1`, which only shows when `quantity > 1`).
  Order: Used up, −1 (if quantity > 1), Used a little, Kept.
- Selecting it sets that item's action to `'use-a-bit'`. No default ever
  pre-selects it.
- On confirm, `use-a-bit` items get a fill-level write instead of a quantity
  write:

```ts
if (u.action === 'use-up') {
  // tombstone (unchanged)
} else if (u.action === 'use-a-bit') {
  await tx.execute('UPDATE pantry_items SET fill_level = ?, updated_at = ? WHERE id = ?', [
    steppedFillLevel(u.item.fillLevel),
    now,
    u.item.itemId,
  ]);
} else {
  // use-some: quantity decrement (unchanged)
}
```

- Deliberate difference from the pantry row's manual fill-bar tap: that
  control **wraps** (¼ → tap → back to Full, a manual "I refilled it"
  reset). The cook sheet's `steppedFillLevel` **floors at ¼** — cooking a
  recipe should never accidentally reset an item to full. Two different
  affordances, two different edge behaviors, both reusing the same ladder
  values.
- `updateCount` (drives the "Update pantry (N)" button label) already counts
  any action `!== 'keep'`, so `use-a-bit` rows count automatically — no
  change needed there.

## 4. Testing

- **Core:** `steppedFillLevel` ladder + undefined-as-Full case in
  `cooked.test.ts`; existing `defaultCookAction`/`decrementedQuantity`/
  `matchCookedItems` tests untouched.
- **Mobile:** no new mobile unit tests planned — `buildCookedSheetItems`
  passing through one more field is covered by existing tests reading through
  its return shape; the write-path branch is a straightforward `tx.execute`
  parallel to the two existing branches, verified on-device.
- **On-device QA:** cook a recipe matching a single-count item (e.g. Olive
  Oil ×1) → "Used a little" appears even though quantity is 1 → confirming
  steps its fill bar down one notch on the pantry row (or sets it to ¾ if it
  had no bar before) → repeating "I cooked this" against the same item steps
  it again, floors at ¼, never wraps back to full from the cook sheet.

## Out of scope

- No change to the pantry row's own manual fill-bar tap behavior (still
  wraps).
- No fractional/custom amount picker — the four-step ladder is the
  deliberately vague primitive the user asked for ("don't want exact
  measurements").
- No UI to show the current fill level inside the cook sheet row itself
  (matches today's sheet, which doesn't show quantity context beyond the
  ×N badge).
