# Diet & Allergy Onboarding + Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Illustrated diet/allergy onboarding step writing into the existing TasteProfile, plus hard-hide diet filtering on Cook-tab suggestions.

**Architecture:** Core gains `allergies` on `TasteProfile`, an `ALLERGY_OPTIONS` catalog, and a pure `dietFilter.ts` (`recipeViolations`/`passesDiet`/`hasDietLines`). Three new glyphs complete the tile art. Mobile gains `DietStep` (BrandTile grids) as step 1 of a two-step `OnboardingScreen`; `TasteQuizSheet` gains matching allergy chips; `RecipesScreen` filters its candidate pool through `passesDiet`. Spec: `docs/superpowers/specs/2026-07-13-diet-allergy-onboarding-design.md`.

**Tech Stack:** TypeScript, vitest (`packages/core`), React Native + jest/jest-expo + @testing-library/react-native (`apps/mobile`). Worktree: `C:\Users\JCS\Pantry-Party-diet`, branch `feat/diet-allergy-onboarding`.

**Verification commands (from worktree root unless noted):**
- Core tests: `npm test --workspace @breadbox/core`
- Mobile: `cd apps/mobile && npx tsc --noEmit && npx jest`
- Lint: `npm run lint` (0 errors required; ~10 pre-existing warnings OK)
- Never commit `package-lock.json` churn (`git checkout -- package-lock.json` if it shows modified).

---

### Task 1: TasteProfile gains `allergies` + `ALLERGY_OPTIONS`

**Files:**
- Modify: `packages/core/src/tasteProfile.ts`
- Modify: `packages/core/src/tasteProfile.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tasteProfile.test.ts`:

```ts
describe('allergies field', () => {
  it('EMPTY_TASTE_PROFILE has an empty allergies list', () => {
    expect(EMPTY_TASTE_PROFILE.allergies).toEqual([]);
  });

  it('ALLERGY_OPTIONS carries the four supported allergens', () => {
    expect(ALLERGY_OPTIONS.map((o) => o.slug)).toEqual(['egg', 'soy', 'fish', 'shellfish']);
  });
});
```

Add `ALLERGY_OPTIONS` to the file's import from `./tasteProfile.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test --workspace @breadbox/core`
Expected: FAIL — `ALLERGY_OPTIONS` not exported / `allergies` undefined.

- [ ] **Step 3: Implement** — in `tasteProfile.ts`:

Add to the `TasteProfile` interface (after `diets`):

```ts
  /** Allergen slugs (ALLERGY_OPTIONS) — hard filters, like diets. */
  allergies: string[];
```

Add after `DIET_OPTIONS`:

```ts
/** Allergen lines beyond the diet list (peanut/tree-nut ride on 'nut-free'). */
export const ALLERGY_OPTIONS: TasteOption[] = [
  { slug: 'egg', label: 'Egg' },
  { slug: 'soy', label: 'Soy' },
  { slug: 'fish', label: 'Fish' },
  { slug: 'shellfish', label: 'Shellfish' },
];
```

Add `allergies: [],` to `EMPTY_TASTE_PROFILE`. If `isEmptyTaste`/similar exists and enumerates fields, include `allergies.length === 0` there too (read the file; keep semantics: a profile with only allergies set is NOT empty).

- [ ] **Step 4: Run tests**

Run: `npm test --workspace @breadbox/core` → all pass (248 + 2 new).
Also: `cd apps/mobile && npx tsc --noEmit` — mobile compiles (the hook's `{ ...EMPTY_TASTE_PROFILE, ...parsed }` spread at `useTasteProfile.ts:35` makes old stored JSON load with `allergies: []` for free; TasteQuizSheet constructs a full profile — if tsc flags a missing `allergies` in its `onSave` object literal, add `allergies: initial.allergies` pass-through there now (preserve, don't edit UI yet).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tasteProfile.ts packages/core/src/tasteProfile.test.ts apps/mobile/src/features/recipes/TasteQuizSheet.tsx
git commit -m "feat(core): TasteProfile.allergies + ALLERGY_OPTIONS catalog"
```

(Drop the TasteQuizSheet path from `git add` if it needed no change.)

---

### Task 2: `dietFilter.ts` — violations, passesDiet, hasDietLines

**Files:**
- Create: `packages/core/src/dietFilter.ts`
- Create: `packages/core/src/dietFilter.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./dietFilter.ts";` after the tasteProfile export)

- [ ] **Step 1: Write the failing tests** — `dietFilter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { EMPTY_TASTE_PROFILE, type TasteProfile } from './tasteProfile.ts';
import { hasDietLines, passesDiet, recipeViolations, type DietCheckRecipe } from './dietFilter.ts';

const profile = (over: Partial<TasteProfile>): TasteProfile => ({ ...EMPTY_TASTE_PROFILE, ...over });
const recipe = (over: Partial<DietCheckRecipe>): DietCheckRecipe => ({
  vegetarian: null, vegan: null, glutenFree: null, ingredientNames: [], ...over,
});

describe('hasDietLines', () => {
  it('is false for an empty profile and true with any diet or allergy', () => {
    expect(hasDietLines(EMPTY_TASTE_PROFILE)).toBe(false);
    expect(hasDietLines(profile({ diets: ['vegan'] }))).toBe(true);
    expect(hasDietLines(profile({ allergies: ['shellfish'] }))).toBe(true);
  });
});

describe('flag-backed diets', () => {
  it('vegetarian requires the flag to be strictly true', () => {
    const p = profile({ diets: ['vegetarian'] });
    expect(recipeViolations(p, recipe({ vegetarian: true }))).toEqual([]);
    expect(recipeViolations(p, recipe({ vegetarian: false }))).toEqual(['vegetarian']);
    expect(recipeViolations(p, recipe({ vegetarian: null }))).toEqual(['vegetarian']);
  });

  it('vegan and gluten-free behave the same way', () => {
    expect(passesDiet(profile({ diets: ['vegan'] }), recipe({ vegan: true }))).toBe(true);
    expect(passesDiet(profile({ diets: ['vegan'] }), recipe({ vegan: false }))).toBe(false);
    expect(passesDiet(profile({ diets: ['gluten-free'] }), recipe({ glutenFree: true }))).toBe(true);
    expect(passesDiet(profile({ diets: ['gluten-free'] }), recipe({}))).toBe(false);
  });
});

describe('keyword-backed lines', () => {
  it('dairy-free catches dairy ingredients', () => {
    const p = profile({ diets: ['dairy-free'] });
    expect(passesDiet(p, recipe({ ingredientNames: ['unsalted butter'] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ['olive oil', 'basil'] }))).toBe(true);
  });

  it('nut-free catches nuts but not nutmeg or butternut squash', () => {
    const p = profile({ diets: ['nut-free'] });
    expect(passesDiet(p, recipe({ ingredientNames: ['roasted peanuts'] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ['almond flour'] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ['nutmeg', 'butternut squash'] }))).toBe(true);
  });

  it('each allergen list hits its ingredients', () => {
    expect(passesDiet(profile({ allergies: ['egg'] }), recipe({ ingredientNames: ['2 eggs'] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ['soy'] }), recipe({ ingredientNames: ['firm tofu'] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ['fish'] }), recipe({ ingredientNames: ['salmon fillet'] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ['shellfish'] }), recipe({ ingredientNames: ['jumbo shrimp'] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ['egg', 'soy', 'fish', 'shellfish'] }), recipe({ ingredientNames: ['chicken breast', 'rice'] }))).toBe(true);
  });

  it('vegan backstops dairy and egg keywords even when the flag lies', () => {
    const p = profile({ diets: ['vegan'] });
    expect(recipeViolations(p, recipe({ vegan: true, ingredientNames: ['heavy cream'] }))).toEqual(['vegan']);
    expect(recipeViolations(p, recipe({ vegan: true, ingredientNames: ['egg yolk'] }))).toEqual(['vegan']);
  });

  it('reports every violated slug', () => {
    const p = profile({ diets: ['vegetarian', 'dairy-free'], allergies: ['shellfish'] });
    const r = recipe({ vegetarian: false, ingredientNames: ['shrimp', 'butter'] });
    expect(recipeViolations(p, r).sort()).toEqual(['dairy-free', 'shellfish', 'vegetarian']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --workspace @breadbox/core` → FAIL (module not found).

- [ ] **Step 3: Implement `dietFilter.ts`:**

```ts
/**
 * Diet & allergy filtering — the "applied elsewhere" step tasteProfile.ts
 * promised. Pure functions, no I/O (pattern: useItUp.ts, cookingDevice.ts).
 *
 * Two mechanisms:
 *  - Flag-backed diets (vegetarian / vegan / gluten-free): the recipe's
 *    boolean must be strictly true — unknown hides, the safe direction for a
 *    hard dietary line.
 *  - Keyword-backed lines (dairy-free / nut-free + the allergens): a
 *    conservative deny-list substring match over lowercased ingredient names.
 *    Keywords are word-ish on purpose ("almond", never bare "nut") so nutmeg
 *    and butternut squash don't false-positive.
 *
 * Vegan additionally backstops the dairy + egg keyword lists — a recipe whose
 * vegan flag lies about cream still gets hidden.
 */
import type { TasteProfile } from "./tasteProfile.ts";

export interface DietCheckRecipe {
  vegetarian?: boolean | null;
  vegan?: boolean | null;
  glutenFree?: boolean | null;
  /** Lowercased ingredient names (caller maps from its recipe shape). */
  ingredientNames: string[];
}

export const DAIRY_KEYWORDS = [
  "milk", "butter", "cheese", "cream", "yogurt", "ghee",
  "mozzarella", "parmesan", "cheddar", "feta", "ricotta",
] as const;

export const NUT_KEYWORDS = [
  "peanut", "almond", "cashew", "walnut", "pecan", "pistachio",
  "hazelnut", "macadamia", "nut butter",
] as const;

export const EGG_KEYWORDS = ["egg", "mayonnaise", "mayo", "aioli"] as const;

export const SOY_KEYWORDS = ["soy", "tofu", "edamame", "tempeh", "miso", "tamari"] as const;

export const FISH_KEYWORDS = [
  "fish", "salmon", "tuna", "cod", "tilapia", "anchov", "sardine", "halibut", "trout",
] as const;

export const SHELLFISH_KEYWORDS = [
  "shrimp", "prawn", "crab", "lobster", "scallop", "clam", "mussel", "oyster",
] as const;

/** True when the profile has no dietary lines at all — callers skip filtering entirely. */
export function hasDietLines(profile: TasteProfile): boolean {
  return profile.diets.length > 0 || profile.allergies.length > 0;
}

function hitsKeywords(names: string[], keywords: readonly string[]): boolean {
  return names.some((raw) => {
    const n = raw.toLowerCase();
    return keywords.some((k) => n.includes(k));
  });
}

/** Slugs from profile.diets + profile.allergies the recipe violates. */
export function recipeViolations(profile: TasteProfile, recipe: DietCheckRecipe): string[] {
  const violated: string[] = [];
  const names = recipe.ingredientNames;

  for (const diet of profile.diets) {
    if (diet === "vegetarian" && recipe.vegetarian !== true) violated.push(diet);
    else if (diet === "vegan" && (recipe.vegan !== true || hitsKeywords(names, DAIRY_KEYWORDS) || hitsKeywords(names, EGG_KEYWORDS))) violated.push(diet);
    else if (diet === "gluten-free" && recipe.glutenFree !== true) violated.push(diet);
    else if (diet === "dairy-free" && hitsKeywords(names, DAIRY_KEYWORDS)) violated.push(diet);
    else if (diet === "nut-free" && hitsKeywords(names, NUT_KEYWORDS)) violated.push(diet);
  }

  for (const allergy of profile.allergies) {
    if (allergy === "egg" && hitsKeywords(names, EGG_KEYWORDS)) violated.push(allergy);
    else if (allergy === "soy" && hitsKeywords(names, SOY_KEYWORDS)) violated.push(allergy);
    else if (allergy === "fish" && hitsKeywords(names, FISH_KEYWORDS)) violated.push(allergy);
    else if (allergy === "shellfish" && hitsKeywords(names, SHELLFISH_KEYWORDS)) violated.push(allergy);
  }

  return violated;
}

/** True when the recipe violates nothing. */
export function passesDiet(profile: TasteProfile, recipe: DietCheckRecipe): boolean {
  return recipeViolations(profile, recipe).length === 0;
}
```

Add to `packages/core/src/index.ts` (after the tasteProfile line): `export * from "./dietFilter.ts";`

- [ ] **Step 4: Run tests**

Run: `npm test --workspace @breadbox/core` → all pass. Note "nutmeg" contains "egg"?? NO — the egg allergen would hit "nutmeg" via bare `"egg"` substring! Verify: `"nutmeg".includes("egg")` is **false** ("nutmEG" — n-u-t-m-e-g contains "eg" not "egg"... letters: nutmeg = n,u,t,m,e,g → substring "egg" needs e,g,g — not present). Also check "eggplant": contains "egg" → egg allergy hides eggplant recipes — conservative over-hide, acceptable; add a test documenting it as INTENDED:

```ts
  it('documents the conservative edge: eggplant trips the egg list', () => {
    expect(passesDiet(profile({ allergies: ['egg'] }), recipe({ ingredientNames: ['eggplant'] }))).toBe(false);
  });
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dietFilter.ts packages/core/src/dietFilter.test.ts packages/core/src/index.ts
git commit -m "feat(core): dietFilter — recipeViolations/passesDiet, flag + keyword rules"
```

---

### Task 3: Three glyphs — wheat, peanut, shrimp (family 49 → 52)

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.pantry.tsx`

- [ ] **Step 1: Extend union, record, tones.** Union additions (after `butterdish`): `| 'wheat' | 'peanut' | 'shrimp'`

Append to `PANTRY_GLYPHS`:

```tsx
  // Wheat sheaf — stalk + grain ellipses, awn ticks.
  wheat: ({ body, cut }) => (
    <>
      <Path d="M24 42 V14" fill="none" stroke={body} />
      <Ellipse cx={24} cy={12} rx={2.6} ry={5} fill={body} />
      <Ellipse cx={19} cy={17} rx={2.4} ry={4.6} fill={body} />
      <Ellipse cx={29} cy={17} rx={2.4} ry={4.6} fill={body} />
      <Ellipse cx={19.5} cy={24} rx={2.4} ry={4.6} fill={body} />
      <Ellipse cx={28.5} cy={24} rx={2.4} ry={4.6} fill={body} />
      <Path d="M19 16 v3 M29 16 v3" fill="none" stroke={cut} />
    </>
  ),
  // Peanut — waisted shell with dimple cross-marks.
  peanut: ({ body, cut }) => (
    <>
      <Path d="M24 10 q7 0 7 7 q0 4 -3 5 q3 2 3 6 q0 8 -7 8 q-7 0 -7 -8 q0 -4 3 -6 q-3 -1 -3 -5 q0 -7 7 -7 Z" fill={body} />
      <Path d="M20 16 l3 3 M25 15 l3 3" fill="none" stroke={cut} />
      <Path d="M20 29 l3 3 M25 28 l3 3" fill="none" stroke={cut} />
    </>
  ),
  // Shrimp — curled body, segment lines, tail fan, eye dot.
  shrimp: ({ body, cut }) => (
    <>
      <Path d="M30 12 C38 16 38 28 30 32 C24 35 16 33 14 28 C19 31 25 30 27 26 C21 26 18 22 20 17 C22 13 27 11 30 12 Z" fill={body} />
      <Path d="M14 28 l-3 6 l7 -1 Z" fill={body} />
      <Path d="M28 15 q4 6 0 13" fill="none" stroke={cut} />
      <Path d="M24 16 q3 5 0 10" fill="none" stroke={cut} />
      <Circle cx={32} cy={16} r={1.4} fill={cut} />
    </>
  ),
```

Append to `PANTRY_TONE`: `wheat: 'ochre', peanut: 'cocoa', shrimp: 'brick',`

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/components/brandGlyphs.test.ts`
Expected: silent; 2 tests pass (52 keys both sides).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.tsx
git commit -m "feat(brand): wheat, peanut, shrimp glyphs for diet tiles (family 52)"
```

---

### Task 4: `dietArt.ts` map + test (TDD)

**Files:**
- Create: `apps/mobile/src/features/onboarding/dietArt.test.ts`
- Create: `apps/mobile/src/features/onboarding/dietArt.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { ALLERGY_OPTIONS, DIET_OPTIONS } from '@breadbox/core';

import { ALLERGY_ART, DIET_ART } from './dietArt';

describe('dietArt', () => {
  it('covers every diet and allergy option', () => {
    for (const o of DIET_OPTIONS) expect(DIET_ART[o.slug]).toBeDefined();
    for (const o of ALLERGY_OPTIONS) expect(ALLERGY_ART[o.slug]).toBeDefined();
  });

  it('no glyph repeats across the screen', () => {
    const all = [...Object.values(DIET_ART), ...Object.values(ALLERGY_ART)];
    expect(new Set(all).size).toBe(all.length);
  });
});
```

- [ ] **Step 2: Run** — `cd apps/mobile && npx jest src/features/onboarding/dietArt.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `dietArt.ts`:**

```ts
/**
 * dietArt — diet/allergy slug → loaf-mark glyph for the onboarding DietStep.
 * One glyph per slug across the whole screen (test-enforced); reuse against
 * OTHER screens (staples picker) is fine — the no-sharing rule is per-grid.
 */
import type { BrandFoodName } from '../../components/BrandIcon';

export const DIET_ART: Record<string, BrandFoodName> = {
  vegetarian: 'carrot',
  vegan: 'herb',
  'gluten-free': 'wheat',
  'dairy-free': 'milkjug',
  'nut-free': 'peanut',
};

export const ALLERGY_ART: Record<string, BrandFoodName> = {
  egg: 'egg',
  soy: 'soybottle',
  fish: 'fish',
  shellfish: 'shrimp',
};
```

- [ ] **Step 4: Run** — 2 tests pass. **Step 5: Commit**

```bash
git add apps/mobile/src/features/onboarding/dietArt.ts apps/mobile/src/features/onboarding/dietArt.test.ts
git commit -m "feat(onboarding): dietArt map for the diet/allergy tiles"
```

---

### Task 5: `DietStep` component (TDD)

**Files:**
- Create: `apps/mobile/src/features/onboarding/DietStep.test.tsx`
- Create: `apps/mobile/src/features/onboarding/DietStep.tsx`

- [ ] **Step 1: Write the failing test:**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DietStep } from './DietStep';

describe('DietStep', () => {
  it('renders both sections and toggles a diet tile on and off', () => {
    const onChange = jest.fn();
    render(<DietStep diets={[]} allergies={[]} onChange={onChange} onContinue={() => {}} />);
    expect(screen.getByText('Do you follow any diets?')).toBeTruthy();
    expect(screen.getByText('Any allergies?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Vegetarian'));
    expect(onChange).toHaveBeenCalledWith({ diets: ['vegetarian'], allergies: [] });
  });

  it('deselects a selected tile and fires onContinue', () => {
    const onChange = jest.fn();
    const onContinue = jest.fn();
    render(
      <DietStep diets={['vegan']} allergies={['shellfish']} onChange={onChange} onContinue={onContinue} />,
    );
    fireEvent.press(screen.getByLabelText('Vegan, added'));
    expect(onChange).toHaveBeenCalledWith({ diets: [], allergies: ['shellfish'] });
    fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Implement `DietStep.tsx`:**

```tsx
/**
 * DietStep — onboarding step 1: "Do you follow any diets? Any allergies?"
 * BrandTile grids over DIET_OPTIONS + ALLERGY_OPTIONS. Controlled + stateless:
 * the parent owns the selections (and persists them into the TasteProfile on
 * continue). Tiles stay tappable when selected — diet choices are reversible,
 * unlike staple adds. Continue with nothing selected IS the skip path.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ALLERGY_OPTIONS, DIET_OPTIONS, type TasteOption } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandTile } from '../../components/BrandTile';
import { ALLERGY_ART, DIET_ART } from './dietArt';

export interface DietSelection {
  diets: string[];
  allergies: string[];
}

function toggle(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

function TileGrid({
  options,
  art,
  selected,
  onToggle,
}: {
  options: TasteOption[];
  art: Record<string, string>;
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {options.map((o) => (
        <View key={o.slug} style={styles.cell}>
          <BrandTile
            glyph={art[o.slug] as never}
            label={o.label}
            selected={selected.includes(o.slug)}
            onPress={() => onToggle(o.slug)}
          />
        </View>
      ))}
    </View>
  );
}

export function DietStep({
  diets,
  allergies,
  onChange,
  onContinue,
}: {
  diets: string[];
  allergies: string[];
  onChange: (sel: DietSelection) => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>1 of 2</Text>
        <Text style={styles.title}>Do you follow any diets?</Text>
        <Text style={styles.hint}>
          We'll hide recipes that don't fit. You can change this anytime in Your Kitchen.
        </Text>
        <TileGrid
          options={DIET_OPTIONS}
          art={DIET_ART}
          selected={diets}
          onToggle={(slug) => onChange({ diets: toggle(diets, slug), allergies })}
        />
        <Text style={styles.section}>Any allergies?</Text>
        <TileGrid
          options={ALLERGY_OPTIONS}
          art={ALLERGY_ART}
          selected={allergies}
          onToggle={(slug) => onChange({ diets, allergies: toggle(allergies, slug) })}
        />
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={onContinue} accessibilityRole="button">
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: tokens.space(6) },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(2),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: -0.5,
    marginBottom: tokens.space(2),
  },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(5),
  },
  section: {
    fontFamily: tokens.font.display.bold,
    fontSize: 20,
    color: tokens.color.ink,
    marginTop: tokens.space(6),
    marginBottom: tokens.space(3),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  // 4 per row; grow capped by maxWidth so ragged last rows stay near full-row width
  cell: { flexBasis: '23%', flexGrow: 1, maxWidth: '25%' },
  footer: { padding: tokens.space(6), paddingTop: tokens.space(3) },
  cta: {
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    paddingVertical: tokens.space(3.5),
    alignItems: 'center',
  },
  ctaText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: '#F7F3E8' },
});
```

Before writing: mirror `OnboardingScreen`'s existing footer/cta styles (read it) — reuse its exact cta color/text token choices rather than the literals above if they differ (`#F7F3E8` should match whatever `OnboardingScreen.styles.ctaText` uses). The `as never` cast on `glyph` avoids widening `DIET_ART` to a glyph-name union type; if tsc accepts `Record<string, BrandFoodName>` → `BrandFoodName` directly (it does — values are typed), DROP the cast and type `art: Record<string, BrandFoodName>` in TileGrid instead. Prefer the typed version.

- [ ] **Step 4: Run** — `npx jest src/features/onboarding/DietStep.test.tsx` → 2 tests pass. **Step 5: Commit**

```bash
git add apps/mobile/src/features/onboarding/DietStep.tsx apps/mobile/src/features/onboarding/DietStep.test.tsx
git commit -m "feat(onboarding): DietStep — illustrated diet/allergy picker"
```

---

### Task 6: OnboardingScreen — two steps + profile save

**Files:**
- Modify: `apps/mobile/src/features/onboarding/OnboardingScreen.tsx`

- [ ] **Step 1: Integrate.** Read the current file first. Changes:

1. New imports:

```tsx
import { useTasteProfile } from '../recipes/useTasteProfile';
import { DietStep, type DietSelection } from './DietStep';
```

2. Inside the component add state + save logic:

```tsx
const [step, setStep] = useState<1 | 2>(1);
const [dietSel, setDietSel] = useState<DietSelection>({ diets: [], allergies: [] });
const [dietSaved, setDietSaved] = useState(false);
const { profile, loaded: profileLoaded, save: saveProfile } = useTasteProfile(activeHouseholdId);

// Persist step-1 answers once the household (and stored profile) are ready —
// survives the first-moment null-household race without blocking the UI.
useEffect(() => {
  if (step === 1 || dietSaved || !profileLoaded || activeHouseholdId === null) return;
  if (dietSel.diets.length === 0 && dietSel.allergies.length === 0) { setDietSaved(true); return; }
  saveProfile({
    ...profile,
    diets: dietSel.diets,
    allergies: dietSel.allergies,
    updatedAt: new Date().toISOString(),
  });
  setDietSaved(true);
}, [step, dietSaved, profileLoaded, activeHouseholdId, dietSel, profile, saveProfile]);
```

VERIFY the hook's API first (`useTasteProfile` return shape — `{ profile, loaded, save }` expected; adapt names to reality). If `save` isn't stable across renders, guard the effect with the `dietSaved` flag as written (it already runs at most once).

3. Render: when `step === 1`, render `<DietStep diets={dietSel.diets} allergies={dietSel.allergies} onChange={setDietSel} onContinue={() => setStep(2)} />` inside the existing SafeAreaView (replacing the ScrollView+footer block); when `step === 2`, render the existing content unchanged, except the eyebrow line gains a "2 of 2" prefix — change `<Text style={styles.eyebrow}>Welcome to {BRAND.productName}</Text>` to `<Text style={styles.eyebrow}>2 of 2 · Welcome to {BRAND.productName}</Text>`.

- [ ] **Step 2: Verify** — `cd apps/mobile && npx tsc --noEmit && npx jest` (all suites; DietStep tests keep passing — the component is unchanged, only its parent wires it).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/onboarding/OnboardingScreen.tsx
git commit -m "feat(onboarding): two-step flow — diet/allergy step feeds the taste profile"
```

---

### Task 7: TasteQuizSheet — allergy chips (parity)

**Files:**
- Modify: `apps/mobile/src/features/recipes/TasteQuizSheet.tsx`

- [ ] **Step 1: Integrate.** Read the file. Changes:

1. Import `ALLERGY_OPTIONS` alongside `DIET_OPTIONS`.
2. Add state next to `diets`: `const [allergies, setAllergies] = useState<string[]>(initial.allergies);` (and reset it wherever the sheet resets `diets` from `initial` on open — find the `useEffect`/reset pattern and mirror it).
3. In step 3's render, after the diets chip block, add an "Allergies" sub-heading (same style as the diets heading) and a chip row mapping `ALLERGY_OPTIONS` with identical Pressable/chip/a11y markup to the diets row, toggling `setAllergies`.
4. In the `onSave` payload object include `allergies,` (and remove any `allergies: initial.allergies` pass-through Task 1 may have added).

- [ ] **Step 2: Verify** — `cd apps/mobile && npx tsc --noEmit && npx jest`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/TasteQuizSheet.tsx
git commit -m "feat(recipes): allergy chips in the taste quiz — parity with onboarding"
```

---

### Task 8: RecipesScreen — hide violations from the candidate pool

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

- [ ] **Step 1: Integrate.** Read the region around the candidates memo (`let candidates = recipes;`, ~line 848). Changes:

1. Extend the `@breadbox/core` import with `hasDietLines, passesDiet`.
2. Locate the screen's taste profile variable (`tasteProfile` — verify how it's obtained; it already feeds `scoreTitle(tasteProfile, …)`; if the screen holds a `TasteProfile` object under another name, adapt).
3. Add a memo ABOVE the ranking memo:

```tsx
// Hard dietary lines: violating recipes never enter ranking. Same-reference
// passthrough when no lines are set, so existing users see zero change.
const dietSafe = useMemo(() => {
  if (!hasDietLines(tasteProfile)) return recipes;
  return recipes.filter((r) =>
    passesDiet(tasteProfile, {
      vegetarian: r.vegetarian,
      vegan: r.vegan,
      glutenFree: r.glutenFree,
      ingredientNames: (r.ingredients.length > 0
        ? r.ingredients.map((i) => i.name)
        : [...r.usedIngredientNames, ...r.missedIngredientNames]
      ).map((n) => n.toLowerCase()),
    }),
  );
}, [recipes, tasteProfile]);
```

4. In the ranking memo, replace its uses of `recipes` with `dietSafe` (the `let candidates = recipes;` line and the healthy-fit `recipes.filter(...)` line) and add `dietSafe` to that memo's dependency array (replacing `recipes` if present).

IMPORTANT: verify the ranking memo's dependency list after the edit — `recipes` should no longer be referenced inside it; the deviceByRecipe/useItUp memos keep using `recipes` (they're keyed by recipe id and unmatched entries are harmless — do NOT change them; smaller diff, same behavior).

- [ ] **Step 2: Verify** — `cd apps/mobile && npx tsc --noEmit && npx jest`, plus `npm run lint` at root (the exhaustive-deps warning must not turn into an error — warnings are fine, matching the file's existing warnings).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(recipes): diet/allergy hard filter on Cook-tab suggestions"
```

---

### Task 9: Full gate, push, PR

- [ ] **Step 1: Full local gate**

```bash
npm run lint && (cd apps/mobile && npx tsc --noEmit && npx jest) && npm test --workspace @breadbox/core
```

Expected: lint 0 errors; tsc silent; mobile jest all pass (prior suites + dietArt + DietStep); core vitest all pass (248 + new).

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/diet-allergy-onboarding
gh pr create --base main --title "feat(onboarding): diet & allergy step + Cook-tab diet filtering" --body "Illustrated diet/allergy onboarding step (Direction B tiles) writing into the existing TasteProfile, plus the hard-hide filtering tasteProfile.ts always promised. Spec: docs/superpowers/specs/2026-07-13-diet-allergy-onboarding-design.md.

- core: TasteProfile.allergies + ALLERGY_OPTIONS; dietFilter (flag diets strict-true, conservative keyword deny-lists, vegan backstop; eggplant-style over-hides documented as intended)
- brand: wheat/peanut/shrimp glyphs (family 52)
- onboarding: two-step flow — DietStep tiles then stock-your-pantry; zero-selection Continue = skip; answers merge into the household TasteProfile
- quiz: allergy chips added to step 3 (same data, no drift)
- cook tab: candidates filtered via passesDiet; empty profile = same-reference passthrough (zero change for existing users)

On-device QA: fresh onboarding both steps; vegetarian hides meat recipes; shellfish hides shrimp; quiz round-trips the same answers; dark mode + VoiceOver.

⚠ Merge-order note: the in-flight lazy-kitchen work also touches OnboardingScreen.tsx (one line) — whichever lands second takes a small conflict.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review

- **Spec coverage:** §1 core (Tasks 1–2, incl. hasDietLines/passesDiet rename), §2 glyphs+dietArt (Tasks 3–4), §3 DietStep/two-step/quiz parity (Tasks 5–7), §4 Cook filtering (Task 8), §5 gate+QA (Task 9). Collision note carried into the PR body.
- **Placeholders:** none; every code step shows the code. Verification-before-edit instructions (hook API, cta tokens, profile variable name) are deliberate read-first guards, not gaps.
- **Type consistency:** `DietSelection` defined in Task 5, consumed in Task 6; `passesDiet/hasDietLines/recipeViolations` signatures match between Tasks 2 and 8; `allergies` field added in Task 1 is read by Tasks 5–8.
