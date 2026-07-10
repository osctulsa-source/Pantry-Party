# "Use It Up" Recipe Ranking + Shopping-List Title Case Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank Cook-tab recipes higher when they use soon-to-expire pantry items (with an explanatory badge), and Title-Case ingredient names when recipe "add missing" feeds the shopping list.

**Architecture:** A new pure scoring module `packages/core/src/useItUp.ts` (token matching reused from `cooked.ts`, urgency weights from days-until-expiry) feeds the existing blend score in `RecipesScreen.tsx` and renders a badge on hero cards and alternate rows. A new `titleCaseIngredient` helper in `packages/core/src/shoppingList.ts` is applied at the two recipe→shopping-list call sites only.

**Tech Stack:** TypeScript, vitest (core), React Native + jest-expo (mobile). Core tests: `npm test` inside `packages/core` (vitest). Mobile tests: `npm test` inside `apps/mobile` (jest).

**Spec:** `docs/superpowers/specs/2026-07-10-use-it-up-ranking-design.md`

**Branch:** `feat/use-it-up-ranking` (already created; spec committed).

---

### Task 1: `titleCaseIngredient` in core

**Files:**
- Modify: `packages/core/src/shoppingList.ts` (append at end)
- Test: `packages/core/src/shoppingList.test.ts` (new file)

- [x] **Step 1: Write the failing test**

Create `packages/core/src/shoppingList.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { titleCaseIngredient } from "./shoppingList.ts";

describe("titleCaseIngredient", () => {
  it("title-cases plain lowercase ingredient names", () => {
    expect(titleCaseIngredient("olive oil")).toBe("Olive Oil");
    expect(titleCaseIngredient("chicken breast")).toBe("Chicken Breast");
  });

  it("keeps small words lowercase unless they lead", () => {
    expect(titleCaseIngredient("cream of tartar")).toBe("Cream of Tartar");
    expect(titleCaseIngredient("salt and pepper")).toBe("Salt and Pepper");
    expect(titleCaseIngredient("the works seasoning")).toBe("The Works Seasoning");
  });

  it("leaves words that already contain uppercase untouched", () => {
    expect(titleCaseIngredient("Parmesan cheese")).toBe("Parmesan Cheese");
    expect(titleCaseIngredient("BBQ sauce")).toBe("BBQ Sauce");
  });

  it("trims and collapses whitespace", () => {
    expect(titleCaseIngredient("  green   beans ")).toBe("Green Beans");
  });

  it("handles single words and empty strings", () => {
    expect(titleCaseIngredient("eggs")).toBe("Eggs");
    expect(titleCaseIngredient("")).toBe("");
    expect(titleCaseIngredient("   ")).toBe("");
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run (from repo root): `cd packages/core && npx vitest run src/shoppingList.test.ts`
Expected: FAIL — `titleCaseIngredient` is not exported.

- [x] **Step 3: Implement**

Append to `packages/core/src/shoppingList.ts`:

```ts
/**
 * Words kept lowercase mid-name when title-casing ("Cream of Tartar").
 * Small connectives only — food words never belong here.
 */
const TITLE_SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "or",
  "the",
  "to",
  "with",
]);

/**
 * Title-case an ingredient name for shopping-list display ("olive oil" →
 * "Olive Oil"). Recipe sources hand us lowercase names; this is the display
 * cleanup at the recipe→list boundary. Words already containing an uppercase
 * letter ("BBQ", "Parmesan") pass through untouched, so it is safe on
 * already-cased input.
 */
export function titleCaseIngredient(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w, i) => {
      if (/[A-Z]/.test(w)) return w;
      if (i > 0 && TITLE_SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd packages/core && npx vitest run src/shoppingList.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add packages/core/src/shoppingList.ts packages/core/src/shoppingList.test.ts
git commit -m "feat(core): titleCaseIngredient — display cleanup for recipe-fed list names"
```

---

### Task 2: `useItUp.ts` core scoring module

**Files:**
- Create: `packages/core/src/useItUp.ts`
- Modify: `packages/core/src/index.ts` (add export line)
- Test: `packages/core/src/useItUp.test.ts` (new file)

- [x] **Step 1: Write the failing test**

Create `packages/core/src/useItUp.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatUseItUpBadge, scoreUseItUp, type UrgentMatch } from "./useItUp.ts";

// Fixed clock: 2026-07-10T12:00:00Z. Expiry dates are date-only ISO strings
// (parse as UTC midnight), matching how the app stores expiresAt.
const NOW = new Date("2026-07-10T12:00:00Z");

function pantry(name: string, expiresAt?: string) {
  return { name, expiresAt };
}

describe("scoreUseItUp", () => {
  it("scores 3 for an item expiring within a day", () => {
    const { score, urgentMatches } = scoreUseItUp(
      ["chicken breast"],
      [pantry("Chicken", "2026-07-11")],
      NOW,
    );
    expect(score).toBe(3);
    expect(urgentMatches).toEqual([{ itemName: "Chicken", daysLeft: 0, status: "warning" }]);
  });

  it("scores 2 in the 2–3 day warning band and 1 in the 4–7 day band", () => {
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-13")], NOW).score).toBe(2);
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-16")], NOW).score).toBe(1);
  });

  it("scores 2 for expired items with status 'expired'", () => {
    const { score, urgentMatches } = scoreUseItUp(
      ["spinach"],
      [pantry("Spinach", "2026-07-08")],
      NOW,
    );
    expect(score).toBe(2);
    expect(urgentMatches[0].status).toBe("expired");
    expect(urgentMatches[0].daysLeft).toBeLessThan(0);
  });

  it("scores 0 beyond 7 days, without expiresAt, and on invalid dates", () => {
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-30")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [pantry("Milk")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [pantry("Milk", "not a date")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-30")], NOW).urgentMatches).toEqual([]);
  });

  it("matches via token normalization (plurals, descriptors)", () => {
    // "tomatoes" (pantry) matches "diced tomato" (ingredient); "fresh" is a stop word.
    const { score } = scoreUseItUp(
      ["fresh diced tomato"],
      [pantry("Tomatoes", "2026-07-11")],
      NOW,
    );
    expect(score).toBe(3);
  });

  it("counts each pantry item once even when several ingredients match it", () => {
    const { score } = scoreUseItUp(
      ["chicken breast", "chicken broth"],
      [pantry("Chicken", "2026-07-11")],
      NOW,
    );
    expect(score).toBe(3);
  });

  it("sums multiple urgent items, capped at 6, sorted most-urgent-first", () => {
    const { score, urgentMatches } = scoreUseItUp(
      ["chicken", "milk", "spinach"],
      [
        pantry("Milk", "2026-07-13"), // 2 pts, 3 days
        pantry("Chicken", "2026-07-11"), // 3 pts, 0 days
        pantry("Spinach", "2026-07-11"), // 3 pts, 0 days → raw 8, capped
      ],
      NOW,
    );
    expect(score).toBe(6);
    expect(urgentMatches.map((m: UrgentMatch) => m.itemName)).toEqual([
      "Chicken",
      "Spinach",
      "Milk",
    ]);
  });

  it("returns zero for empty inputs", () => {
    expect(scoreUseItUp([], [pantry("Milk", "2026-07-11")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [], NOW).score).toBe(0);
  });
});

describe("formatUseItUpBadge", () => {
  const m = (itemName: string, daysLeft: number, status: UrgentMatch["status"]): UrgentMatch => ({
    itemName,
    daysLeft,
    status,
  });

  it("returns null for no matches", () => {
    expect(formatUseItUpBadge([])).toBeNull();
  });

  it("formats each urgency band, lowercasing the item name", () => {
    expect(formatUseItUpBadge([m("Spinach", -2, "expired")])).toBe("Use it up: spinach · expired");
    expect(formatUseItUpBadge([m("Chicken", 0, "warning")])).toBe(
      "Use it up: chicken · expires today",
    );
    expect(formatUseItUpBadge([m("Chicken", 1, "warning")])).toBe(
      "Use it up: chicken · 1 day left",
    );
    expect(formatUseItUpBadge([m("Milk", 3, "warning")])).toBe("Use it up: milk · 3 days left");
  });

  it("appends a +N more suffix for multiple matches", () => {
    expect(
      formatUseItUpBadge([m("Chicken", 0, "warning"), m("Milk", 3, "warning")]),
    ).toBe("Use it up: chicken · expires today +1 more");
    expect(
      formatUseItUpBadge([
        m("Chicken", 0, "warning"),
        m("Milk", 3, "warning"),
        m("Spinach", 5, "soon"),
      ]),
    ).toBe("Use it up: chicken · expires today +2 more");
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd packages/core && npx vitest run src/useItUp.test.ts`
Expected: FAIL — module `./useItUp.ts` not found.

- [x] **Step 3: Implement**

Create `packages/core/src/useItUp.ts`:

```ts
/**
 * "Use it up" — expiry-aware recipe urgency scoring. Pure functions, no I/O.
 *
 * Answers: how urgently does THIS recipe help the user consume pantry items
 * that are about to expire? The Cook tab folds the score into its ranking
 * blend and shows the badge so the boost is explainable, never mysterious.
 *
 * Matching reuses normalizeFoodTokens from cooked.ts — the same recipe/pantry
 * pair must match here exactly as it does in the cooked-it decrement sheet.
 * Consistency beats cleverness (see cooked.ts module doc).
 *
 * Weights are deliberately coarse bands on days-until-expiry; the cap keeps a
 * fridge full of wilting produce from drowning the taste signal entirely.
 */

import { normalizeFoodTokens } from "./cooked.ts";

export interface UrgentMatch {
  /** Pantry item's display name (as stored). */
  itemName: string;
  /** Whole days until expiry (floor). Negative when already expired. */
  daysLeft: number;
  status: "expired" | "warning" | "soon";
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** One recipe can't run away from the taste signal on urgency alone. */
const SCORE_CAP = 6;

/** Days-until-expiry → urgency points. 0 = not urgent. */
function urgencyWeight(daysLeft: number): number {
  if (daysLeft < 0) return 2; // expired — still worth surfacing, below "today"
  if (daysLeft <= 1) return 3; // today / tomorrow
  if (daysLeft <= 3) return 2; // the expiry warning window
  if (daysLeft <= 7) return 1; // this week
  return 0;
}

function statusFor(daysLeft: number): UrgentMatch["status"] {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 3) return "warning";
  return "soon";
}

/**
 * Score how urgently a recipe consumes expiring pantry items.
 *
 * Each pantry item that (a) token-matches any used ingredient and (b) expires
 * within 7 days contributes its urgency weight once — even if several
 * ingredients match it. `urgentMatches` is sorted most-urgent-first
 * (fewest daysLeft; input order breaks ties). Items without a parseable
 * expiresAt never contribute (same policy as getExpiryStatus).
 */
export function scoreUseItUp(
  usedIngredientNames: string[],
  pantryItems: Array<{ name: string; expiresAt?: string }>,
  now: Date,
): { score: number; urgentMatches: UrgentMatch[] } {
  const ingredientTokens = new Set(
    usedIngredientNames.flatMap((n) => normalizeFoodTokens(n)),
  );
  if (ingredientTokens.size === 0) return { score: 0, urgentMatches: [] };

  const matches: UrgentMatch[] = [];
  let raw = 0;
  for (const item of pantryItems) {
    if (!item.expiresAt) continue;
    const expiry = new Date(item.expiresAt);
    if (Number.isNaN(expiry.getTime())) continue;
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / MS_PER_DAY);
    const weight = urgencyWeight(daysLeft);
    if (weight === 0) continue;
    if (!normalizeFoodTokens(item.name).some((t) => ingredientTokens.has(t))) continue;
    raw += weight;
    matches.push({ itemName: item.name, daysLeft, status: statusFor(daysLeft) });
  }
  matches.sort((a, b) => a.daysLeft - b.daysLeft);
  return { score: Math.min(raw, SCORE_CAP), urgentMatches: matches };
}

/**
 * Card badge for the most urgent match, e.g. "Use it up: chicken · 2 days
 * left" (+ " +1 more" when several items are urgent). Null when nothing is.
 * Item names render lowercase to match the header reason line's style.
 */
export function formatUseItUpBadge(matches: UrgentMatch[]): string | null {
  const top = matches[0];
  if (!top) return null;
  const when =
    top.status === "expired"
      ? "expired"
      : top.daysLeft === 0
        ? "expires today"
        : top.daysLeft === 1
          ? "1 day left"
          : `${top.daysLeft} days left`;
  const extra = matches.length > 1 ? ` +${matches.length - 1} more` : "";
  return `Use it up: ${top.itemName.toLowerCase()} · ${when}${extra}`;
}
```

Note on the daysLeft math with the fixed test clock: expiresAt `"2026-07-11"` parses as 2026-07-11T00:00:00Z, which is 12h after NOW → `floor(0.5) = 0` days ("expires today"). `"2026-07-13"` → 2.5 → 2 days (warning band). `"2026-07-16"` → 5.5 → 5 (soon band). `"2026-07-08"` → −2.5 → −3 (expired).

Add to `packages/core/src/index.ts` after the `./substitutions.ts` line:

```ts
export * from "./useItUp.ts";
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd packages/core && npx vitest run src/useItUp.test.ts`
Expected: PASS (all tests). Then run the whole core suite to check nothing broke: `npx vitest run` → all green.

- [x] **Step 5: Commit**

```bash
git add packages/core/src/useItUp.ts packages/core/src/useItUp.test.ts packages/core/src/index.ts
git commit -m "feat(core): use-it-up urgency scoring — expiring pantry items boost recipe rank"
```

---

### Task 3: Wire scoring + badge into the Cook tab

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

No new unit tests here (badge is a pure-text render of the tested core functions); the existing jest-expo suite must stay green.

- [x] **Step 1: Import the new core functions**

In the `@breadbox/core` import block (lines 64–78), add `formatUseItUpBadge` and `scoreUseItUp` (alphabetical order within the block):

```ts
import {
  buildTasteProfile,
  defaultMealForHour,
  formatUseItUpBadge,
  getExpiryStatus,
  matchCookedItems,
  mealtimeLabel,
  scoreTitle,
  scoreUseItUp,
  seedPrefsFromTaste,
  suggestSubstitutes,
  type MealType,
  type PantryItem,
  type PrefEvent,
  type RecipePrefs,
  type SubstituteSuggestion,
} from '@breadbox/core';
```

- [x] **Step 2: Compute per-recipe urgency in CookThis**

In the `CookThis` component, directly BELOW the `const [missingAdded, setMissingAdded] = ...` line (line ~617) and ABOVE `onAddMissing`, add:

```ts
  // "Use it up": per-recipe expiry urgency. Score joins the ranking blend
  // below; badge explains the boost on the card. Recomputed only when the
  // fetched page or the (reactive) pantry changes.
  const useItUpByRecipe = useMemo(() => {
    const pantry = items.map((i) => ({ name: i.name, expiresAt: i.expiresAt }));
    const map = new Map<number, { score: number; badge: string | null; expired: boolean }>();
    for (const r of recipes) {
      if (r.usedIngredientNames.length === 0) continue;
      const { score, urgentMatches } = scoreUseItUp(r.usedIngredientNames, pantry, now);
      if (score === 0) continue;
      map.set(r.id, {
        score,
        badge: formatUseItUpBadge(urgentMatches),
        expired: urgentMatches[0]?.status === 'expired',
      });
    }
    return map;
  }, [recipes, items, now]);
```

- [x] **Step 3: Fold the score into the blend**

In the `pool` memo, change the `blend` function (line ~655) to add the urgency term, and add `useItUpByRecipe` to the memo's dependency array:

```ts
    const blend = (r: SpoonacularRecipe) =>
      scoreTitle(prefs, r.title) * 1.5 +
      scoreTitle(tasteProfile, r.title) * 2 +
      scoreTitle(seedPrefs, r.title) * 1.5 +
      r.usedIngredientCount +
      (useItUpByRecipe.get(r.id)?.score ?? 0) +
      (healthy ? ((r.healthScore ?? 0) / 100) * 6 : 0) +
      (readyNow && isReadyNow(r) ? 3 : 0) +
      (easy && isEasy(r) ? 3 : 0);
    return [...candidates].sort((a, b) => blend(b) - blend(a));
  }, [recipes, prefs, tasteProfile, seedPrefs, healthy, easy, readyNow, useItUpByRecipe]);
```

- [x] **Step 4: Pass the badge into HeroCard and RecipeRow**

HeroCard render site (line ~782): add a `useItUp` prop:

```tsx
        renderItem={({ item }) => (
          <HeroCard
            recipe={item}
            favorited={isFavorited(item.id)}
            skipped={skipped.has(item.id)}
            missingAdded={missingAdded.has(item.id)}
            substitutes={swapsByRecipe.get(item.id) ?? []}
            useItUp={useItUpByRecipe.get(item.id) ?? null}
            onToggleFavorite={(r) => void onToggleFavorite(r)}
            onSkip={onSkip}
            onOpen={onOpen}
            onCooked={onCooked}
            onAddMissing={(r) => void onAddMissing(r)}
          />
        )}
```

Both RecipeRow call sites (suggestions ~line 812, alternates ~line 821) gain the same prop:

```tsx
            <RecipeRow key={r.id} recipe={r} useItUp={useItUpByRecipe.get(r.id) ?? null} onOpen={onOpen} />
```

- [x] **Step 5: Render the badge in HeroCard**

Add the prop to `HeroCard`'s signature:

```ts
function HeroCard({
  recipe,
  favorited,
  skipped,
  missingAdded,
  substitutes,
  useItUp,
  onToggleFavorite,
  onSkip,
  onOpen,
  onCooked,
  onAddMissing,
}: {
  recipe: SpoonacularRecipe;
  favorited: boolean;
  skipped: boolean;
  missingAdded: boolean;
  substitutes: SubstituteSuggestion[];
  useItUp: { badge: string | null; expired: boolean } | null;
  onToggleFavorite: (r: SpoonacularRecipe) => void;
  onSkip: (r: SpoonacularRecipe) => void;
  onOpen: (r: SpoonacularRecipe) => void;
  onCooked: (r: SpoonacularRecipe) => void;
  onAddMissing: (r: SpoonacularRecipe) => void;
}) {
```

Inside `styles.heroPad`, directly after the `<Text style={styles.match}>{matchLine(recipe)}</Text>` line (~932), add:

```tsx
          {useItUp?.badge && (
            <Text
              style={[
                styles.useItUp,
                {
                  color: useItUp.expired
                    ? tokens.semantic.expiry.expired
                    : tokens.semantic.expiry.warning,
                },
              ]}
              numberOfLines={1}
            >
              {useItUp.badge}
            </Text>
          )}
```

- [x] **Step 6: Render the badge in RecipeRow**

Update `RecipeRow` (line ~162):

```tsx
function RecipeRow({
  recipe,
  useItUp,
  onOpen,
}: {
  recipe: SpoonacularRecipe;
  useItUp: { badge: string | null; expired: boolean } | null;
  onOpen: (r: SpoonacularRecipe) => void;
}) {
  return (
    <Pressable style={styles.altRow} onPress={() => onOpen(recipe)}>
      {recipe.image ? (
        <Image source={{ uri: recipe.image }} style={styles.altThumb} />
      ) : (
        <View style={[styles.altThumb, styles.altThumbPlaceholder]}>
          <ChefHat size={22} color={tokens.color.accent} strokeWidth={1.5} />
        </View>
      )}
      <View style={styles.altText}>
        <Text style={styles.altName} numberOfLines={1}>
          {recipe.title}
        </Text>
        <Text style={styles.altMeta} numberOfLines={1}>
          {recipe.readyInMinutes !== null ? `${recipe.readyInMinutes} min · ` : ''}
          {matchLine(recipe)}
          {recipe.healthScore !== null && recipe.healthScore >= 70 ? ' · very healthy' : ''}
          {recipe.sourceName === CURATED_SOURCE_NAME ? ' · house recipe' : ''}
        </Text>
        {useItUp?.badge && (
          <Text
            style={[
              styles.useItUp,
              {
                color: useItUp.expired
                  ? tokens.semantic.expiry.expired
                  : tokens.semantic.expiry.warning,
              },
            ]}
            numberOfLines={1}
          >
            {useItUp.badge}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={tokens.color.inkMuted} />
    </Pressable>
  );
}
```

- [x] **Step 7: Add the style**

In the `StyleSheet.create` block, next to the other text styles (after `metaTxtEasy` is fine):

```ts
  useItUp: { fontFamily: tokens.font.body.semibold, fontSize: 12, marginTop: tokens.space(1) },
```

- [x] **Step 8: Typecheck + run the mobile suite**

Run: `npm run typecheck` (repo root) → no errors.
Run: `cd apps/mobile && npm test` → all existing tests PASS.

- [x] **Step 9: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(cook): use-it-up ranking boost + badge — expiring items surface the recipes that use them"
```

---

### Task 4: Title-case the recipe → shopping-list adds (the bug fix)

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx` (`onAddMissing`, line ~620)
- Modify: `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx` (`onAddMissing`, line ~167)

The fix lives at the recipe call sites, NOT inside `addToShoppingList` — manual adds must keep the user's own casing. Dedupe is already case-insensitive (`LOWER(name) = LOWER(?)`), so re-cased adds still dedupe against existing rows.

- [x] **Step 1: RecipesScreen**

Add `titleCaseIngredient` to the `@breadbox/core` import block (alphabetical: after `suggestSubstitutes`). Then in `onAddMissing`:

```ts
    for (const name of r.missedIngredientNames) {
      await addToShoppingList({ householdId, userId, name: titleCaseIngredient(name), source: 'recipe' });
    }
```

- [x] **Step 2: RecipeDetailScreen**

Add `titleCaseIngredient` to that file's `@breadbox/core` import block the same way. Then in its `onAddMissing`:

```ts
    for (const name of recipe.missedIngredientNames) {
      await addToShoppingList({ householdId: activeHouseholdId, userId, name: titleCaseIngredient(name), source: 'recipe' });
    }
```

- [x] **Step 3: Typecheck + mobile tests**

Run: `npm run typecheck` → no errors. Run: `cd apps/mobile && npm test` → PASS.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx apps/mobile/src/features/recipes/RecipeDetailScreen.tsx
git commit -m "fix(shopping): Title-Case ingredient names when recipes feed the list"
```

---

### Task 5: Full verification

- [x] **Step 1: Run everything**

```bash
cd packages/core && npx vitest run        # all core tests
cd ../../apps/mobile && npm test          # jest-expo suite
cd ../.. && npm run typecheck && npm run lint
```

Expected: all green. Lint may flag pre-existing issues in untouched files — only new warnings in touched files matter.

- [x] **Step 2: Mark plan checkboxes done and commit any stragglers**

```bash
git status   # should be clean apart from this plan file's checked boxes
```
