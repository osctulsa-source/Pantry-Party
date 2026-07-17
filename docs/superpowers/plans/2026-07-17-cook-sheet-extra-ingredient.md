# Cook Sheet Extra Ingredient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add a pantry item the recipe didn't call for to the "I cooked this" sheet, so an ad hoc addition to a dish still gets decremented correctly.

**Architecture:** A pure `filterAddableItems` function in the mobile app (excludes already-shown rows, filters by search query) backs a new `AddCookExtraSheet` picker modal. `CookedItSheet` gains local `extras` state holding user-added rows, renders them identically to matched rows, and folds them into the existing write/action logic by iterating `[...items, ...extras]` instead of `items` alone. Both existing callers (`RecipeDetailScreen`, `RecipesScreen`) already hold the full pantry list in scope and pass it down as one new prop.

**Tech Stack:** TypeScript, React Native/Expo, PowerSync (unchanged write path), Jest.

**Spec:** `docs/superpowers/specs/2026-07-17-cook-sheet-extra-ingredient-design.md`

**Working branch:** `feat/cook-sheet-extra-ingredient` (already created; spec committed).

**Commands:**
- Mobile tests: `npm test` from `apps/mobile/` (jest).
- Typecheck: `npx tsc --noEmit` from `apps/mobile/` (root typecheck is known-broken).
- Lint (gates CI): `npm run lint` from repo root.

---

### Task 1: `filterAddableItems` (pure function, TDD)

**Files:**
- Create: `apps/mobile/src/features/recipes/filterAddableItems.ts`
- Create: `apps/mobile/src/features/recipes/filterAddableItems.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/recipes/filterAddableItems.test.ts`:

```ts
import { filterAddableItems } from './filterAddableItems';
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

describe('filterAddableItems', () => {
  const pantry = [
    item({ id: '1', name: 'Olive oil' }),
    item({ id: '2', name: 'Soy sauce' }),
    item({ id: '3', name: 'Fish sauce' }),
  ];

  it('excludes items already shown in the sheet', () => {
    const result = filterAddableItems(pantry, new Set(['1']), '');
    expect(result.map((i) => i.id)).toEqual(['2', '3']);
  });

  it('filters by case-insensitive substring match', () => {
    const result = filterAddableItems(pantry, new Set(), 'sauce');
    expect(result.map((i) => i.id).sort()).toEqual(['2', '3']);
    expect(filterAddableItems(pantry, new Set(), 'SAUCE').map((i) => i.id).sort()).toEqual(['2', '3']);
  });

  it('empty query returns every eligible item', () => {
    const result = filterAddableItems(pantry, new Set(), '');
    expect(result).toHaveLength(3);
  });

  it('empty pantry or no matches returns []', () => {
    expect(filterAddableItems([], new Set(), '')).toEqual([]);
    expect(filterAddableItems(pantry, new Set(), 'nonexistent')).toEqual([]);
  });

  it('combines exclusion and query filtering', () => {
    const result = filterAddableItems(pantry, new Set(['2']), 'sauce');
    expect(result.map((i) => i.id)).toEqual(['3']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/mobile/`): `npm test -- filterAddableItems`
Expected: FAIL — cannot resolve `./filterAddableItems`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/features/recipes/filterAddableItems.ts`:

```ts
/**
 * Pantry items eligible for "Add something else you used" in the cook sheet:
 * not already showing as a row (matched, fallback, or already added as an
 * extra), and matching the search query by substring (case-insensitive).
 */
import type { PantryItem } from '@breadbox/core';

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

- [ ] **Step 4: Run to verify pass**

Run (from `apps/mobile/`): `npm test -- filterAddableItems` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/recipes/filterAddableItems.ts apps/mobile/src/features/recipes/filterAddableItems.test.ts
git commit -m "feat(recipes): filterAddableItems for the cook-sheet extra-ingredient picker"
```

---

### Task 2: `AddCookExtraSheet` picker component

**Files:**
- Create: `apps/mobile/src/features/recipes/AddCookExtraSheet.tsx`

No unit test — this is a small presentational modal; its logic (`filterAddableItems`) is already covered by Task 1, and the interaction is verified on-device in Task 4.

- [ ] **Step 1: Create the component**

Create `apps/mobile/src/features/recipes/AddCookExtraSheet.tsx`:

```tsx
/**
 * AddCookExtraSheet — "Add something else you used" picker, layered on top
 * of CookedItSheet. Search-filters the household pantry down to items not
 * already showing as a row (see filterAddableItems); picking one hands the
 * chosen PantryItem back to the caller, which appends it as a normal sheet
 * row. Pure UI — no writes happen here.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PantryItem } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { filterAddableItems } from './filterAddableItems';

export function AddCookExtraSheet({
  pantryItems,
  alreadyShownIds,
  onPick,
  onClose,
}: {
  pantryItems: PantryItem[];
  alreadyShownIds: ReadonlySet<string>;
  onPick: (item: PantryItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = filterAddableItems(pantryItems, alreadyShownIds, query);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <Text style={styles.title}>Add something else you used</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your pantry"
            placeholderTextColor={tokens.color.inkMuted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            accessibilityLabel="Search your pantry"
          />
          {results.length === 0 ? (
            <Text style={styles.emptyTxt}>No matching pantry items.</Text>
          ) : (
            <ScrollView style={styles.results} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {results.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onPick(item)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.name}`}
                >
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                    {item.quantity > 1 ? `  ×${item.quantity}` : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(8),
    maxHeight: '80%',
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 18,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    marginBottom: tokens.space(3),
  },
  input: {
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: tokens.space(3),
  },
  results: { flexGrow: 0 },
  row: {
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowPressed: { opacity: 0.6 },
  rowName: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  emptyTxt: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    paddingVertical: tokens.space(4),
  },
  cancel: {
    marginTop: tokens.space(2),
    paddingVertical: tokens.space(3),
    alignItems: 'center',
  },
  cancelTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
});
```

- [ ] **Step 2: Typecheck**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, but it must still compile standalone).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/AddCookExtraSheet.tsx
git commit -m "feat(recipes): AddCookExtraSheet pantry picker"
```

---

### Task 3: Wire extras into `CookedItSheet`

**Files:**
- Modify: `apps/mobile/src/features/recipes/CookedItSheet.tsx`

- [ ] **Step 1: Add the `pantryItems` prop and extras state**

Add the import:

```ts
import type { PantryItem } from '@breadbox/core';
import { AddCookExtraSheet } from './AddCookExtraSheet';
```

(Merge `PantryItem` into whatever `@breadbox/core` import style is cleanest — `CookedItSheet.tsx` currently imports `decrementedQuantity, defaultCookAction, steppedFillLevel, type CookAction` from `@breadbox/core`; add `type PantryItem` to that same import statement rather than a second one.)

Extend the props signature:

```tsx
export function CookedItSheet({
  recipeId,
  recipeTitle,
  items,
  pantryItems,
  householdId,
  onClose,
  onDone,
}: {
  recipeId: number;
  recipeTitle: string;
  items: CookedSheetItem[];
  pantryItems: PantryItem[];
  householdId: string | null;
  onClose: () => void;
  onDone: (updatedCount: number) => void;
}) {
```

Add extras state right after the existing `actions`/`submitting`/`error` state:

```tsx
  const [extras, setExtras] = useState<CookedSheetItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
```

- [ ] **Step 2: Fold extras into the derived values and action helpers**

Replace the `actionFor`/`updateCount` lines and `setAction`:

```tsx
  const allRows = [...items, ...extras];
  const actionFor = (itemId: string): CookAction => actions[itemId] ?? 'keep';
  const updateCount = allRows.filter((i) => actionFor(i.itemId) !== 'keep').length;

  function setAction(itemId: string, action: CookAction) {
    setActions((prev) => ({ ...prev, [itemId]: action }));
  }
```

- [ ] **Step 3: Add the picker-open handler and pick handler**

Add near the other handlers (after `setAction`, before `onConfirm`):

```tsx
  const alreadyShownIds = new Set(allRows.map((i) => i.itemId));

  function onPickExtra(pantryItem: PantryItem) {
    const row: CookedSheetItem = {
      itemId: pantryItem.id,
      itemName: pantryItem.name,
      quantity: pantryItem.quantity,
      matched: false,
      fillLevel: pantryItem.fillLevel,
    };
    setExtras((prev) => [...prev, row]);
    setActions((prev) => ({ ...prev, [row.itemId]: defaultCookAction(row.quantity) }));
    setPickerOpen(false);
  }
```

- [ ] **Step 4: Use `allRows` in `onConfirm`**

Change the first line of `onConfirm`:

```tsx
  async function onConfirm() {
    if (submitting) return;
    const updates = allRows
      .map((item) => ({ item, action: actionFor(item.itemId) }))
      .filter((u) => u.action !== 'keep');
```

(The rest of `onConfirm`'s body — the `writeTransaction` branches on `use-up`/`use-a-bit`/else — is unchanged; it already operates on `updates`, which now includes extras.)

- [ ] **Step 5: Render extras as rows and add the trigger row**

Replace the item-list JSX block:

```tsx
          {allRows.length === 0 ? (
            <Text style={styles.emptyTxt}>Nothing in your pantry to update.</Text>
          ) : (
            <ScrollView style={styles.rows} showsVerticalScrollIndicator={false}>
              {allRows.map((item) => {
                const action = actionFor(item.itemId);
                return (
                  <View key={item.itemId} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.itemName}
                        {item.quantity > 1 ? `  ×${item.quantity}` : ''}
                      </Text>
                      {item.matched && item.matchedIngredient && (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          recipe uses {item.matchedIngredient}
                        </Text>
                      )}
                    </View>
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
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Pressable
            onPress={() => setPickerOpen(true)}
            style={styles.addExtraRow}
            accessibilityRole="button"
            accessibilityLabel="Add something else you used"
          >
            <Text style={styles.addExtraTxt}>+ Add something else you used</Text>
          </Pressable>
```

Note the `emptyTxt` condition changed from `items.length === 0` to `allRows.length === 0` — the "nothing to update" message must not show once an extra has been added even if no items matched. The `+ Add something else you used` row appears **below** both the list and the empty-state message (per spec §2), so it's placed after the `{allRows.length === 0 ? ... : ...}` block, still inside the card, before the `{error && ...}` line.

- [ ] **Step 6: Render the picker modal conditionally**

`AddCookExtraSheet` is its own `Modal`, so it must render as a sibling of the
main sheet's `<Modal>`, not nested inside it. Change the component's
outermost `return` from a single `<Modal>` to a fragment wrapping the
existing `<Modal>` (unchanged internals — eyebrow, title, hint, the
`allRows` list, the `addExtraRow` trigger from Step 5, error, confirm,
cancel) plus a new conditional block:

```tsx
  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
          <View style={styles.card}>
            {/* everything already inside <View style={styles.card}> from Step 5 stays exactly as-is */}
          </View>
        </View>
      </Modal>
      {pickerOpen && (
        <AddCookExtraSheet
          pantryItems={pantryItems}
          alreadyShownIds={alreadyShownIds}
          onPick={onPickExtra}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
```

Concretely: wrap the pre-existing `<Modal>...</Modal>` in `<>` / `</>`, and
insert the `{pickerOpen && <AddCookExtraSheet .../>}` block as its sibling
immediately after `</Modal>` and before the final `</>`.

- [ ] **Step 7: Add the `addExtraRow` styles**

Add to the `StyleSheet.create` block, near `emptyTxt`:

```ts
  addExtraRow: {
    paddingVertical: tokens.space(3),
    alignItems: 'center',
  },
  addExtraTxt: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.accent,
  },
```

- [ ] **Step 8: Typecheck (expect failures in both callers)**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: FAIL — `RecipeDetailScreen.tsx` and `RecipesScreen.tsx` both render `<CookedItSheet ... />` without the now-required `pantryItems` prop. This is expected; Task 4 completes the compile unit.

- [ ] **Step 9: Commit** (do not commit yet — Task 4 completes the compile unit)

Proceed directly to Task 4; commit together.

---

### Task 4: Pass `pantryItems` from both callers

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx`
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

Both files already hold the full pantry list in a variable named `items` (from `usePantryItems()`) in the same scope that builds `sheetItems` via `buildCookedSheetItems`. Confirmed during planning — no new data fetching needed.

- [ ] **Step 1: `RecipeDetailScreen.tsx`**

Find the `<CookedItSheet` JSX (renders when `cooking` is true, around where `sheetItems` is passed as `items`). Add the new prop:

```tsx
        <CookedItSheet
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          items={sheetItems}
          pantryItems={items}
          householdId={activeHouseholdId}
          onClose={() => setCooking(false)}
          onDone={onCookDone}
        />
```

- [ ] **Step 2: `RecipesScreen.tsx`**

Find its `<CookedItSheet` JSX (same pattern, `sheetItems` built from `cooking.usedIngredientNames`). Add the new prop:

```tsx
        <CookedItSheet
          recipeId={cooking.id}
          recipeTitle={cooking.title}
          items={sheetItems}
          pantryItems={items}
          householdId={activeHouseholdId}
          onClose={() => setCooking(null)}
          onDone={onCookDone}
        />
```

Match the existing prop names/values already present at that call site exactly — only `pantryItems={items}` is new; do not alter `recipeId`/`recipeTitle`/`onClose`/`onDone`/`householdId` from whatever they currently are. If the existing call site's prop values differ from the illustrative names above, keep the existing ones and only add the `pantryItems={items}` line.

- [ ] **Step 3: Typecheck + full mobile suite**

Run (from `apps/mobile/`): `npx tsc --noEmit && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 4: Commit (Tasks 3+4 together — one compile unit)**

```bash
git add apps/mobile/src/features/recipes/CookedItSheet.tsx apps/mobile/src/features/recipes/RecipeDetailScreen.tsx apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(recipes): add-something-else-you-used in the cook sheet"
```

---

### Task 5: Full verification

- [ ] **Step 1: Mobile suite** — Run (from `apps/mobile/`): `npm test` → all PASS.
- [ ] **Step 2: Typecheck** — Run (from `apps/mobile/`): `npx tsc --noEmit` → clean.
- [ ] **Step 3: Lint** — Run (from repo root): `npm run lint` → 0 errors; none in touched files.
- [ ] **Step 4: On-device QA**
  - Open "I cooked this" on a recipe with at least one matched item → tap "+ Add something else you used" → search field opens, typing filters the pantry list, already-matched items don't appear.
  - Pick an item → it appears as a new row with the same action chips (no "recipe uses" caption), defaulted per `defaultCookAction` for its quantity.
  - Confirm → the extra's pantry row actually changed (tombstoned / quantity decremented / fill level stepped, matching whichever action was left selected) alongside any matched items.
  - Reopen the sheet on the same recipe → try to add the same item again → it's excluded from the picker's results (still shown as a leftover row only if the previous confirm didn't remove it, e.g. "Kept" — otherwise it's simply back in the general pantry and addable again next time).
  - Try the flow when the sheet's matched-items list is empty (a recipe with no matches) → the empty-state message is replaced correctly once an extra is added, and the "+ Add something else" row is still reachable even with zero matches.
- [ ] **Step 5: Hand off** — branch `feat/cook-sheet-extra-ingredient`; PR after user QA.
