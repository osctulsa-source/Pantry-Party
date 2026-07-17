# Cook Sheet Partial Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Used a little" action to the "I cooked this" sheet that nudges an item's existing `fillLevel` down one notch instead of forcing an all-or-nothing quantity decrement — for single-count items (a bottle of oil, a jar of garlic) that get partially used without being anywhere near empty.

**Architecture:** A pure `steppedFillLevel` function in `@breadbox/core` (Full→¾→½→¼, floors — does not wrap) sits beside the existing `CookAction`/`decrementedQuantity`. `fillLevel` is threaded from `PantryItem` through `buildCookedSheetItems` into `CookedItSheet`, which gains a 4th always-visible `Choice` chip and a third write branch (`fill_level` UPDATE) alongside its existing tombstone and quantity-decrement branches.

**Tech Stack:** TypeScript, vitest (packages/core), React Native/Expo, PowerSync (SQLite) writes.

**Spec:** `docs/superpowers/specs/2026-07-17-cook-sheet-partial-use-design.md`

**Working branch:** `feat/cook-sheet-partial-use` (already created; spec committed).

**Note on spec §1:** the spec described extracting `PantryScreen.cycleFill`'s inline ladder into the shared function. On inspection, `cycleFill` **wraps** at ¼ back to Full (a manual "I refilled it" reset) while this feature must **floor** at ¼ (spec §3, intentional difference). Since the two functions have different edge behavior by design, `steppedFillLevel` is written as its own function and `cycleFill` is left untouched — refactoring it to call a floor-only helper would be incorrect. This plan implements the floor-only function as specified in §1's code block and the wrap/floor distinction in §3; it does not touch `PantryScreen.cycleFill`.

**Commands:**
- Core tests: `npm test` from `packages/core/` (vitest; filter: `npm test -- cooked`).
- Mobile tests: `npm test` from `apps/mobile/` (jest).
- Typecheck: `npx tsc --noEmit` from `apps/mobile/` (root typecheck is known-broken).
- Lint (gates CI): `npm run lint` from repo root.

---

### Task 1: `steppedFillLevel` (core, TDD)

**Files:**
- Modify: `packages/core/src/cooked.ts`
- Modify: `packages/core/src/cooked.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/cooked.test.ts` (new `describe` block, alongside the existing ones):

```ts
import { steppedFillLevel } from './cooked.ts';
```

Merge that name into the existing top-of-file import from `./cooked.ts` rather than adding a second import statement. Then append:

```ts
describe('steppedFillLevel', () => {
  it('steps down one notch: Full → ¾ → ½ → ¼', () => {
    expect(steppedFillLevel(1)).toBe(0.75);
    expect(steppedFillLevel(0.75)).toBe(0.5);
    expect(steppedFillLevel(0.5)).toBe(0.25);
  });

  it('floors at ¼ — never implies zero, never wraps back to full', () => {
    expect(steppedFillLevel(0.25)).toBe(0.25);
  });

  it('treats undefined (never tracked) as Full, one step down', () => {
    expect(steppedFillLevel(undefined)).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `packages/core/`): `npm test -- cooked`
Expected: FAIL — `steppedFillLevel` is not exported from `./cooked.ts`.

- [ ] **Step 3: Implement**

In `packages/core/src/cooked.ts`, append after `decrementedQuantity`:

```ts
/**
 * One step down the Full → ¾ → ½ → ¼ ladder (the same values the pantry
 * row's manual fill bar uses). Floors at ¼ — "used up" is the honest path to
 * empty, this never implies zero. Undefined (fill tracking is opt-in; never
 * set) behaves as Full, matching the pantry row's display convention.
 *
 * Deliberately does NOT wrap back to Full the way the pantry row's own
 * tap-to-cycle does — that's a manual "I refilled it" reset; cooking a
 * recipe should never accidentally reset an item to full.
 */
export function steppedFillLevel(current: number | undefined): number {
  const level = current ?? 1;
  if (level > 0.75) return 0.75;
  if (level > 0.5) return 0.5;
  return 0.25;
}
```

- [ ] **Step 4: Run to verify pass, then the whole core suite**

Run (from `packages/core/`): `npm test -- cooked` → PASS (all cooked.test.ts cases, including the 3 new ones).
Run (from `packages/core/`): `npm test` → all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cooked.ts packages/core/src/cooked.test.ts
git commit -m "feat(core): steppedFillLevel for cook-sheet partial use"
```

---

### Task 2: Thread `fillLevel` through `buildCookedSheetItems`

**Files:**
- Modify: `apps/mobile/src/features/recipes/buildCookedSheetItems.ts`
- Test: `apps/mobile/src/features/recipes/buildCookedSheetItems.test.ts` (create if it doesn't already exist — check first)

- [ ] **Step 1: Confirm no existing test file**

Confirmed during planning: `apps/mobile/src/features/recipes/buildCookedSheetItems.test.ts` does not exist yet. Create it fresh in Step 2 (no existing style/fixtures to reconcile with).

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/src/features/recipes/buildCookedSheetItems.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildCookedSheetItems } from './buildCookedSheetItems';
import type { PantryItem } from '@breadbox/core';

function item(overrides: Partial<PantryItem> & { id: string; name: string }): PantryItem {
  return {
    householdId: 'h1',
    quantity: 1,
    location: 'pantry',
    addedAt: new Date().toISOString(),
    source: 'manual',
    addedBy: 'user-1',
    updatedAt: Date.now(),
    deleted: false,
    ...overrides,
  } as PantryItem;
}

describe('buildCookedSheetItems fillLevel passthrough', () => {
  it('carries fillLevel through for matched items', () => {
    const pantry = [item({ id: '1', name: 'Olive oil', quantity: 1, fillLevel: 0.75 })];
    const rows = buildCookedSheetItems(['olive oil'], pantry);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fillLevel).toBe(0.75);
  });

  it('carries undefined fillLevel through when the item never tracked it', () => {
    const pantry = [item({ id: '1', name: 'Olive oil', quantity: 1 })];
    const rows = buildCookedSheetItems(['olive oil'], pantry);
    expect(rows[0]?.fillLevel).toBeUndefined();
  });
});
```

(`PantryItem`'s required fields per `packages/core/src/schema.ts` are `id`, `householdId`, `name`, `quantity`, `location`, `addedAt`, `source`, `addedBy`, `updatedAt`, `deleted` — `brand`/`category`/`barcode`/`unit`/`expiresAt`/`fillLevel` are all `.optional()`, so the fixture omits them by default and only sets what a test needs via `overrides`.)

- [ ] **Step 3: Run to verify failure**

Run (from `apps/mobile/`): `npm test -- buildCookedSheetItems`
Expected: FAIL — `rows[0].fillLevel` is `undefined` in the first case (should be `0.75`), because the field isn't populated yet. (TypeScript may also flag the field as unknown on `CookedSheetItemRow` — that is expected until Step 4.)

- [ ] **Step 4: Add the field and populate it**

In `apps/mobile/src/features/recipes/buildCookedSheetItems.ts`:

```ts
export interface CookedSheetItemRow {
  itemId: string;
  itemName: string;
  quantity: number;
  matched: boolean;
  matchedIngredient?: string;
  /** For the cook sheet's "Used a little" action — undefined when never tracked. */
  fillLevel: number | undefined;
}
```

Update both return-mapping branches:

```ts
  if (matches.length > 0) {
    return matches.map((m) => {
      const source = pantry.find((p) => p.id === m.itemId);
      return {
        itemId: m.itemId,
        itemName: m.itemName,
        quantity: m.quantity,
        matched: true,
        matchedIngredient: m.matchedIngredient,
        fillLevel: source?.fillLevel,
      };
    });
  }

  return pantry
    .filter((i) => getExpiryStatus(i, now) !== 'fresh')
    .sort((a, b) => {
      const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return ae - be;
    })
    .slice(0, FALLBACK_CAP)
    .map((i) => ({
      itemId: i.id,
      itemName: i.name,
      quantity: i.quantity,
      matched: false,
      fillLevel: i.fillLevel,
    }));
```

(`matchCookedItems` returns `CookCandidate` without `fillLevel` — hence the `pantry.find` lookup by id in the matched branch. The fallback branch already iterates `PantryItem` directly, so `i.fillLevel` is available without a lookup.)

- [ ] **Step 5: Run to verify pass**

Run (from `apps/mobile/`): `npm test -- buildCookedSheetItems` → PASS.

- [ ] **Step 6: Typecheck**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: FAIL — `CookedItSheet.tsx`'s `CookedSheetItem` interface and its callers (`RecipeDetailScreen.tsx` / `RecipesScreen.tsx`, wherever `CookedSheetItemRow` values are passed into `CookedItSheet`) are not yet updated. This is expected; Task 3 completes the compile unit. Confirm the error is specifically about the missing `fillLevel` field before moving on — if you see a different error, stop and investigate.

- [ ] **Step 7: Commit** (do not commit yet — Task 3 completes the compile unit)

Proceed directly to Task 3; commit both together.

---

### Task 3: "Used a little" in `CookedItSheet`

**Files:**
- Modify: `apps/mobile/src/features/recipes/CookedItSheet.tsx`

- [ ] **Step 1: Extend `CookedSheetItem` and import `steppedFillLevel`**

```ts
import { decrementedQuantity, defaultCookAction, steppedFillLevel, type CookAction } from '@breadbox/core';
```

```ts
export interface CookedSheetItem {
  itemId: string;
  itemName: string;
  quantity: number;
  /** True when core's matcher linked this item to a recipe ingredient. */
  matched: boolean;
  matchedIngredient?: string;
  /** For "Used a little" — undefined when the item never tracked fill level. */
  fillLevel: number | undefined;
}
```

- [ ] **Step 2: Add the write branch in `onConfirm`**

Replace the `writeTransaction` body's action branching:

```ts
        await db.writeTransaction(async (tx) => {
          for (const u of updates) {
            if (u.action === 'use-up') {
              // Tombstone — identical to a manual delete from Edit Item.
              await tx.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [
                now,
                u.item.itemId,
              ]);
            } else if (u.action === 'use-a-bit') {
              // Nudge the fill bar down one notch — the same primitive the
              // pantry row's manual tap uses, but floored (never wraps back
              // to full) so cooking can't accidentally "refill" an item.
              await tx.execute('UPDATE pantry_items SET fill_level = ?, updated_at = ? WHERE id = ?', [
                steppedFillLevel(u.item.fillLevel),
                now,
                u.item.itemId,
              ]);
            } else {
              await tx.execute('UPDATE pantry_items SET quantity = ?, updated_at = ? WHERE id = ?', [
                decrementedQuantity(u.item.quantity),
                now,
                u.item.itemId,
              ]);
            }
          }
        });
```

- [ ] **Step 3: Add the 4th `Choice` chip**

Replace the `choices` block inside the row map:

```tsx
                    <View style={styles.choices}>
                      <Choice
                        label="Used up"
                        selected={action === 'use-up'}
                        onPress={() => setAction(item.itemId, 'use-up')}
                      />
                      {item.quantity > 1 && (
                        <Choice
                          label="−1"
                          selected={action === 'use-some'}
                          onPress={() => setAction(item.itemId, 'use-some')}
                        />
                      )}
                      <Choice
                        label="Used a little"
                        selected={action === 'use-a-bit'}
                        onPress={() => setAction(item.itemId, 'use-a-bit')}
                      />
                      <Choice
                        label="Kept"
                        selected={action === 'keep'}
                        onPress={() => setAction(item.itemId, 'keep')}
                      />
                    </View>
```

No change is needed to `updateCount` (already `!== 'keep'`) or to the initial-`actions` seeding in `useState` (`defaultCookAction` never returns `'use-a-bit'`, so nothing pre-selects it — matches spec §1).

- [ ] **Step 4: Callers of `buildCookedSheetItems` / `CookedSheetItem`**

Confirmed during planning: both call sites (`RecipeDetailScreen.tsx`'s `sheetItems` memo and `RecipesScreen.tsx`'s `sheetItems` memo) pass `buildCookedSheetItems(...)`'s return value straight through as `CookedSheetItem[]` — neither manually constructs a `CookedSheetItem` object. Since Task 2 added the same-named `fillLevel: number | undefined` field to `CookedSheetItemRow`, and this step adds it to `CookedSheetItem`, the shapes already match — no edits needed in either screen file.

- [ ] **Step 5: Typecheck + full mobile suite**

Run (from `apps/mobile/`): `npx tsc --noEmit && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 6: Commit (Tasks 2+3 together — one compile unit)**

```bash
git add apps/mobile/src/features/recipes/buildCookedSheetItems.ts apps/mobile/src/features/recipes/buildCookedSheetItems.test.ts apps/mobile/src/features/recipes/CookedItSheet.tsx
git commit -m "feat(recipes): Used a little action nudges fill level in the cook sheet"
```

(If Task 4's Step 4 above required editing a caller file, include it in this same commit.)

---

### Task 4: Full verification

- [ ] **Step 1: Core suite** — Run (from `packages/core/`): `npm test` → all PASS.
- [ ] **Step 2: Mobile suite** — Run (from `apps/mobile/`): `npm test` → all PASS.
- [ ] **Step 3: Typecheck** — Run (from `apps/mobile/`): `npx tsc --noEmit` → clean.
- [ ] **Step 4: Lint** — Run (from repo root): `npm run lint` → 0 errors; none in touched files.
- [ ] **Step 5: On-device QA**
  - Cook a recipe matching a single-count item (e.g. Olive Oil ×1, no existing fill bar) → "Used a little" appears alongside Used up / Kept even though quantity is 1.
  - Confirming it → the pantry row now shows a ¾ fill bar (item had no fillLevel before, treated as Full → stepped to ¾).
  - Cook the same recipe again against the same item → fill bar steps to ½, then ¼.
  - Cook it a third/fourth time after reaching ¼ → stays at ¼ (floors, never jumps back to full).
  - Confirm the pantry row's own manual tap-to-cycle still wraps ¼ → Full as before (untouched behavior).
- [ ] **Step 6: Hand off** — branch `feat/cook-sheet-partial-use`; PR after user QA.
