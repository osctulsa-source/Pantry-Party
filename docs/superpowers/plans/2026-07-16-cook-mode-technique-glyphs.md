# Cook Mode Animated Technique Glyphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A constant animated "technique glyph" hero inside Cook Mode's step screen — 12 loaf-mark technique loops plus 3 stage fallbacks, resolved per step via authored tag → keyword matcher → stage rule.

**Architecture:** New glyphs live in the existing brand-glyph family as static base + named animatable layers; a declarative keyframe spec per glyph is driven by one shared `Animated.loop` on a 0→1 progress value; each animatable layer is its own absolutely-positioned `Svg` inside an `Animated.View` so all motion runs on the native driver. A pure keyword matcher (with negation guard) covers all recipes; an optional per-step `technique` field in the curated pipeline overrides it.

**Tech Stack:** react-native-svg (existing dep), React Native core `Animated` + `AccessibilityInfo`, Jest, `data/recipes/validate.mjs` (plain node). **No new dependencies** — the feature must stay OTA-shippable.

**Spec:** `docs/superpowers/specs/2026-07-16-cook-mode-technique-glyphs-design.md`

**Repo facts the engineer needs:**
- Run tests from `apps/mobile`: `npm test -- <pattern>` (Jest, tests colocated with source).
- Typecheck from `apps/mobile`: `npx tsc --noEmit` (the ROOT typecheck script is broken — never use it).
- Lint from repo root: `npm run lint` (gates CI).
- Curated data two-copy rule: authoring source `data/recipes/*.json`, byte-identical bundle copy `apps/mobile/src/data/curated/*.json`. This plan adds NO data content — the new `technique` field is optional and starts unauthored — so no data files change.
- Glyph paint rules (`apps/mobile/src/components/BrandIcon.tsx`): solid silhouette, cream cut-marks (`stroke-width` 2 for marks), outer `<G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">`, one `BRAND_LEAF` leaf where natural, tones from `apps/mobile/src/theme/brandPalette.ts` (`toneHex`, `BRAND_CREAM`, `BRAND_LEAF`).
- Reference for the approved motion: `cook-motion-mockups.html` (repo root, untracked) — open it in a browser to see the loops these specs reproduce.

**File map:**

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/data/spoonacular/types.ts` | modify | optional `technique?: string` on `RecipeStep` |
| `data/recipes/validate.mjs` | modify | validate the optional enum in base + variants modes |
| `apps/mobile/src/data/curated/curatedVariants.test.ts` | modify | passthrough test: `technique` survives defensive parse |
| `apps/mobile/src/features/recipes/matchTechnique.ts` | create | keyword rules, negation guard, `matchTechnique`, `resolveStepGlyph` |
| `apps/mobile/src/features/recipes/matchTechnique.test.ts` | create | matcher + resolution tests |
| `apps/mobile/src/components/brandGlyphs.technique.tsx` | create | 12 technique + 3 stage glyph defs (base + layers) |
| `apps/mobile/src/components/brandGlyphs.technique.test.ts` | create | structural guards (records cover ids exactly) |
| `apps/mobile/src/components/techniqueMotion.ts` | create | declarative keyframe spec per glyph |
| `apps/mobile/src/components/techniqueMotion.test.ts` | create | spec sanity (durations, keyframe rules, layer ids) |
| `apps/mobile/src/components/TechniqueGlyph.tsx` | create | layered renderer + shared loop driver + reduce-motion |
| `apps/mobile/src/features/recipes/CookModeView.tsx` | modify | hero slot above step text |

---

### Task 1: Schema plumbing — `technique` field in types + validator

**Files:**
- Modify: `apps/mobile/src/data/spoonacular/types.ts:15-24`
- Modify: `data/recipes/validate.mjs`
- Modify: `apps/mobile/src/data/curated/curatedVariants.test.ts`

- [ ] **Step 1: Add the optional field to `RecipeStep`**

In `apps/mobile/src/data/spoonacular/types.ts`, add one line to the `RecipeStep` interface after `lengthMinutes`:

```ts
export interface RecipeStep {
  number: number;
  step: string;
  /** Ingredient names used in THIS step (cook-along "for this step" line). Empty for older cached responses. */
  ingredients: string[];
  /** Equipment names this step needs (mise en place + per-step hints). Empty for older cached responses. */
  equipment: string[];
  /** Step duration in minutes when tagged — drives in-step timers. null otherwise. */
  lengthMinutes: number | null;
  /** Authored technique id for the cook-mode glyph ("none" suppresses the keyword matcher). Curated pipeline only; absent everywhere else. */
  technique?: string;
}
```

- [ ] **Step 2: Write the failing passthrough test**

Append to the existing `describe` block (or add a new one) in `apps/mobile/src/data/curated/curatedVariants.test.ts`:

```ts
import { parseVariants } from './curatedVariants';

describe('technique field passthrough', () => {
  it('parseVariants keeps an authored technique on a step', () => {
    const raw = [
      {
        recipeId: 9000001,
        device: 'crockpot',
        readyInMinutes: 240,
        steps: [
          {
            number: 1,
            step: 'Dice the onion into small, even pieces.',
            ingredients: [],
            equipment: [],
            lengthMinutes: null,
            technique: 'chop',
          },
        ],
      },
    ];
    const parsed = parseVariants(raw);
    expect(parsed.get(9000001)?.[0]?.steps[0]?.technique).toBe('chop');
  });
});
```

(Adjust the import line to merge with the file's existing imports rather than duplicating.)

- [ ] **Step 3: Run the test — it should already PASS**

Run (from `apps/mobile`): `npm test -- curatedVariants`
Expected: PASS. `isStep` is a structural guard — extra optional fields ride through untouched, so no `curatedVariants.ts` change is needed. The test exists to lock that behavior in; if it FAILS, something strips fields and must be investigated, not patched around.

- [ ] **Step 4: Add the enum to the validator**

In `data/recipes/validate.mjs`, add after the `DEVICES` set (line ~23):

```js
const TECHNIQUES = new Set([
  'chop', 'stir', 'simmer', 'flip', 'knead', 'season',
  'pour', 'grate', 'roll', 'rest', 'preheat', 'mash', 'none',
]);
```

In `validateRecipes`, inside the per-step loop (after the `lengthMinutes` check, ~line 109), add:

```js
      if (s.technique !== undefined && !TECHNIQUES.has(s.technique))
        where(`step ${si + 1} technique invalid (got ${s.technique})`);
```

In `validateVariants`, inside its per-step loop (after its `lengthMinutes` check, ~line 178), add the same two lines.

- [ ] **Step 5: Verify the validator — good data passes, bad data fails**

Run from repo root:

```powershell
node data/recipes/validate.mjs data/recipes/curated.recipes.json
```
Expected: ends with `PASS` (0 errors — existing data has no `technique` fields).

```powershell
node data/recipes/validate.mjs --variants data/recipes/curated.variants.json
```
Expected: ends with `PASS`.

Now prove the negative. Write a scratch file `technique-bad.json` in the session scratchpad directory (NOT the repo) containing one recipe copied verbatim from `curated.recipes.json` (the first array element), with `"technique": "julienne-madness"` added to its first step. Run:

```powershell
node data/recipes/validate.mjs "<scratchpad>\technique-bad.json"
```
Expected: `ERROR [...] step 1 technique invalid (got julienne-madness)` and exit `FAIL`. Delete the scratch file after.

- [ ] **Step 6: Typecheck and commit**

Run (from `apps/mobile`): `npx tsc --noEmit` — expected: no errors.

```bash
git add apps/mobile/src/data/spoonacular/types.ts data/recipes/validate.mjs apps/mobile/src/data/curated/curatedVariants.test.ts
git commit -m "feat(recipes): optional per-step technique field + validation"
```

---

### Task 2: Keyword matcher + resolution (`matchTechnique.ts`)

**Files:**
- Create: `apps/mobile/src/features/recipes/matchTechnique.ts`
- Test: `apps/mobile/src/features/recipes/matchTechnique.test.ts`

Note: this file imports the `Technique`/`Stage` types from `brandGlyphs.technique.tsx` (Task 3). To keep tasks independently runnable, this task creates the type-owner file FIRST with only the id constants — Task 3 fills in the glyph artwork.

- [ ] **Step 1: Create the id constants (skeleton of the glyph file)**

Create `apps/mobile/src/components/brandGlyphs.technique.tsx` with ONLY the ids for now:

```tsx
/**
 * brandGlyphs.technique — animated technique + stage glyphs for Cook Mode.
 * Same construction rules as the loaf-mark family (solid silhouette, cream
 * cut-marks, stroke 3, leaf where natural), but scenes are multi-tone, so
 * colors are baked per glyph from brandPalette instead of taking a Paint.
 * Each glyph = a static `base` plus named animatable `layers`; motion lives
 * in techniqueMotion.ts, rendering in TechniqueGlyph.tsx.
 */
import type { ReactNode } from 'react';

export const TECHNIQUES = [
  'chop', 'stir', 'simmer', 'flip', 'knead', 'season',
  'pour', 'grate', 'roll', 'rest', 'preheat', 'mash',
] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const STAGES = ['prep', 'cooking', 'finishing'] as const;
export type Stage = (typeof STAGES)[number];

/** Every id TechniqueGlyph can render. */
export type TechniqueGlyphName = Technique | Stage;

export interface GlyphLayer {
  /** Referenced by the motion spec — must be unique within the glyph. */
  id: string;
  node: () => ReactNode;
}

export interface TechniqueGlyphDef {
  base: () => ReactNode;
  /** Render order: earlier layers sit BEHIND later ones. */
  layers: GlyphLayer[];
}
```

(No glyph record yet — Task 3 adds it.)

- [ ] **Step 2: Write the failing matcher tests**

Create `apps/mobile/src/features/recipes/matchTechnique.test.ts`:

```ts
import { matchTechnique, resolveStepGlyph } from './matchTechnique';

describe('matchTechnique', () => {
  it('matches core technique verbs', () => {
    expect(matchTechnique('Dice the onion into small, even pieces.')).toBe('chop');
    expect(matchTechnique('Whisk the eggs until frothy.')).toBe('stir');
    expect(matchTechnique('Bring to a boil, then simmer for 10 minutes.')).toBe('simmer');
    expect(matchTechnique('Sear the chicken thighs skin-side down.')).toBe('flip');
    expect(matchTechnique('Knead the dough for 8 minutes.')).toBe('knead');
    expect(matchTechnique('Season generously with salt and pepper.')).toBe('season');
    expect(matchTechnique('Drain the pasta, reserving a cup of water.')).toBe('pour');
    expect(matchTechnique('Grate the parmesan over the top.')).toBe('grate');
    expect(matchTechnique('Roll out the dough on a floured surface.')).toBe('roll');
    expect(matchTechnique('Let it rest for 5 minutes before slicing?')).toBe('rest');
    expect(matchTechnique('Preheat the oven to 400 degrees.')).toBe('preheat');
    expect(matchTechnique('Mash the potatoes until smooth.')).toBe('mash');
  });

  it('is case-insensitive', () => {
    expect(matchTechnique('DICE THE ONION.')).toBe('chop');
  });

  it('ignores negated clauses', () => {
    expect(matchTechnique('Do not stir while the caramel forms.')).toBe(null);
    expect(matchTechnique("Don't flip until the edges are set. Cook 3 minutes.")).toBe(null);
  });

  it('a negation only kills its own clause, not the sentence after it', () => {
    expect(matchTechnique('Do not stir. Simmer gently for 20 minutes.')).toBe('simmer');
  });

  it('rule order wins over text position', () => {
    // 'roll' outranks 'chop' in the rule list even though "cut" appears first.
    expect(matchTechnique('Cut the dough in half, then roll out each piece.')).toBe('roll');
    // 'preheat' outranks 'flip' — "bake until browned" is an oven step.
    expect(matchTechnique('Bake until browned, about 25 minutes.')).toBe('preheat');
  });

  it('returns null when nothing matches', () => {
    expect(matchTechnique('Transfer to a serving plate.')).toBe(null);
    expect(matchTechnique('')).toBe(null);
  });
});

describe('resolveStepGlyph', () => {
  const total = 6;

  it('authored technique beats the matcher', () => {
    expect(resolveStepGlyph('knead', 'Stir everything together.', 2, total)).toBe('knead');
  });

  it('authored "none" suppresses the matcher and falls to stage', () => {
    expect(resolveStepGlyph('none', 'Stir everything together.', 2, total)).toBe('cooking');
  });

  it('bogus authored value falls through to the matcher', () => {
    expect(resolveStepGlyph('zzz-not-real', 'Stir everything together.', 2, total)).toBe('stir');
  });

  it('no authored value uses the matcher', () => {
    expect(resolveStepGlyph(null, 'Dice the onion.', 2, total)).toBe('chop');
  });

  it('stage fallback: first step is prep, last is finishing, middle is cooking', () => {
    expect(resolveStepGlyph(null, 'Get everything ready.', 0, total)).toBe('prep');
    expect(resolveStepGlyph(null, 'Enjoy while warm.', total - 1, total)).toBe('finishing');
    expect(resolveStepGlyph(null, 'Wait for the magic.', 3, total)).toBe('cooking');
  });

  it('a single-step recipe falls back to prep', () => {
    expect(resolveStepGlyph(null, 'Assemble everything.', 0, 1)).toBe('prep');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `apps/mobile`): `npm test -- matchTechnique`
Expected: FAIL — cannot find module `./matchTechnique`.

- [ ] **Step 4: Implement the matcher**

Create `apps/mobile/src/features/recipes/matchTechnique.ts`:

```ts
/**
 * matchTechnique — maps a cook-mode step's text to a technique glyph.
 *
 * Pure and keyword-based (same precedent as CookModeView's parseMinutes):
 * works for Spoonacular and curated recipes alike. Ordered rules, FIRST RULE
 * that hits wins — order encodes specificity ("roll out" beats the "cut"
 * inside the same sentence), not text position. Negated clauses ("do not
 * stir…") are stripped before matching so warnings can't trigger a glyph.
 * Curated recipes may carry an authored per-step `technique` that overrides
 * all of this — see resolveStepGlyph.
 */
import { STAGES, TECHNIQUES, type Stage, type Technique } from '../../components/brandGlyphs.technique';

/** Kill a negation and the rest of its clause (up to . , or ;). */
const NEGATION = /\b(?:do not|don'?t|avoid|never|no need to|without)\b[^.,;]*/gi;

export const TECHNIQUE_RULES: ReadonlyArray<readonly [Technique, RegExp]> = [
  ['preheat', /\b(?:preheat(?:ing|ed)?|bake[sd]?|baking|roast(?:ing|ed)?|broil(?:ing|ed)?|into the oven)\b/],
  ['grate', /\b(?:grate[sd]?|grating|zest(?:ing|ed)?|shred(?:ding|ded)?)\b/],
  ['mash', /\b(?:mash(?:ing|ed)?|pur[ée]e[sd]?|blend(?:ing|ed)?|blitz(?:ing|ed)?|food processor)\b/],
  ['roll', /\b(?:roll(?:ing|ed|s)? out|rolling pin|flatten(?:ing|ed)?)\b/],
  ['knead', /\b(?:knead(?:ing|ed)?|fold(?:ing|ed)?|press(?:ing|ed)?|shape[sd]?|shaping|form(?:ing|ed)? into)\b/],
  ['chop', /\b(?:chop(?:ping|ped)?|dice[sd]?|dicing|mince[sd]?|mincing|cube[sd]?|slice[sd]?|slicing|julienne[sd]?|halve[sd]?|quarter(?:ed)?|cut(?:ting)?)\b/],
  ['season', /\b(?:season(?:ing|ed)?|sprinkle[sd]?|sprinkling|garnish(?:ing|ed)?|salt and pepper|dust(?:ing|ed)?)\b/],
  ['flip', /\b(?:flip(?:ping|ped)?|saut[ée](?:ing|ed)?|sear(?:ing|ed)?|brown(?:ing|ed)?|toss(?:ing|ed)?|(?:pan-?)?fry(?:ing)?|fried)\b/],
  ['simmer', /\b(?:simmer(?:ing|ed)?|boil(?:ing|ed)?|poach(?:ing|ed)?|steam(?:ing|ed)?|reduce[sd]? (?:the )?(?:heat|sauce|liquid))\b/],
  ['pour', /\b(?:pour(?:ing|ed)?|drain(?:ing|ed)?|strain(?:ing|ed)?)\b/],
  ['stir', /\b(?:stir(?:ring|red)?|whisk(?:ing|ed)?|beat(?:ing|en)?|mix(?:ing|ed)?|combine[sd]?|whip(?:ping|ped)?)\b/],
  ['rest', /\b(?:rest(?:ing|ed)?|cool(?:ing|ed)?|chill(?:ing|ed)?|set aside|refrigerate[sd]?|marinate[sd]?|let (?:it |them )?(?:stand|sit)|rise|proof(?:ing|ed)?)\b/],
];

export function matchTechnique(stepText: string): Technique | null {
  const text = stepText.toLowerCase().replace(NEGATION, ' ');
  for (const [technique, pattern] of TECHNIQUE_RULES) {
    if (pattern.test(text)) return technique;
  }
  return null;
}

const TECHNIQUE_IDS: ReadonlySet<string> = new Set(TECHNIQUES);

/**
 * The hero slot's resolution chain: authored technique → keyword match →
 * stage fallback (spec rule: first step → prep, last → finishing, middle →
 * cooking; a single-step recipe counts as prep). "none" is the authored
 * escape hatch: suppress the matcher, show the stage glyph.
 */
export function resolveStepGlyph(
  authored: string | null | undefined,
  stepText: string,
  stepIdx: number,
  totalSteps: number,
): Technique | Stage {
  const stage: Stage =
    stepIdx <= 0 ? STAGES[0] : stepIdx >= totalSteps - 1 ? STAGES[2] : STAGES[1];
  if (authored === 'none') return stage;
  if (authored && TECHNIQUE_IDS.has(authored)) return authored as Technique;
  return matchTechnique(stepText) ?? stage;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `apps/mobile`): `npm test -- matchTechnique`
Expected: PASS (all cases). If a rule-order test fails, fix the RULE ORDER, not the test.

- [ ] **Step 6: Typecheck and commit**

Run (from `apps/mobile`): `npx tsc --noEmit` — expected: no errors.

```bash
git add apps/mobile/src/features/recipes/matchTechnique.ts apps/mobile/src/features/recipes/matchTechnique.test.ts apps/mobile/src/components/brandGlyphs.technique.tsx
git commit -m "feat(cook): technique keyword matcher + step glyph resolution"
```

---

### Task 3: The glyph artwork (`brandGlyphs.technique.tsx`)

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.technique.tsx` (append to the Task 2 skeleton)
- Test: `apps/mobile/src/components/brandGlyphs.technique.test.ts`

The shapes below are ports of the approved mockups (`cook-motion-mockups.html`) plus six new scenes in the same construction language. Shapes may be visually fine-tuned during the manual QA task — coordinates are starting points, structure (base/layer split, layer ids) is contract.

- [ ] **Step 1: Write the failing structural test**

Create `apps/mobile/src/components/brandGlyphs.technique.test.ts`:

```ts
import { STAGES, TECHNIQUES, TECHNIQUE_GLYPHS } from './brandGlyphs.technique';

// Mirrors brandGlyphs.test.ts: the glyph record and the id lists must cover
// exactly the same names, so every future technique/stage addition is guarded
// structurally.
describe('technique glyph family', () => {
  const allIds = [...TECHNIQUES, ...STAGES].sort();

  it('the glyph record covers every technique and stage id exactly', () => {
    expect(Object.keys(TECHNIQUE_GLYPHS).sort()).toEqual(allIds);
  });

  it('layer ids are unique within each glyph', () => {
    for (const id of allIds) {
      const layerIds = TECHNIQUE_GLYPHS[id as keyof typeof TECHNIQUE_GLYPHS].layers.map((l) => l.id);
      expect(new Set(layerIds).size).toBe(layerIds.length);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/mobile`): `npm test -- brandGlyphs.technique`
Expected: FAIL — `TECHNIQUE_GLYPHS` is not exported.

- [ ] **Step 3: Add the glyph record**

Append to `apps/mobile/src/components/brandGlyphs.technique.tsx` (below the Task 2 skeleton). Add the SVG + palette imports at the top of the file:

```tsx
import { Circle, Ellipse, Path } from 'react-native-svg';

import { BRAND_CREAM, BRAND_LEAF, toneHex } from '../theme/brandPalette';
```

Then the record:

```tsx
const CREAM = BRAND_CREAM;
const LEAF = BRAND_LEAF;
/** Neutral warm gray for steam/heat wisps — the one non-palette color this family needs. */
const STEAM = '#8B8474';
const TERRA = toneHex('terracotta');
const BRICK = toneHex('brick');
const OCHRE = toneHex('ochre');
const COCOA = toneHex('cocoa');
const OLIVE = toneHex('olive');
const SPRUCE = toneHex('spruce');
const BLUE = toneHex('blue');
const PLUM = toneHex('plum');

export const TECHNIQUE_GLYPHS: Record<TechniqueGlyphName, TechniqueGlyphDef> = {
  // -------- techniques (12) --------
  chop: {
    base: () => (
      <>
        <Path d="M13 36 Q13 32.5 16.5 32.5 L34 33.5 Q36 34.5 36 36 Q36 38.5 33 39 L16.5 39.5 Q13 39.5 13 36 Z" fill={TERRA} />
        <Path d="M22 33.5 l0.5 5" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M28 34 l0.5 4.5" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M13 36 L7 32 M13 36 L6 36 M13 36 L7 40" stroke={LEAF} fill="none" strokeWidth={2.4} />
        <Ellipse cx={40.5} cy={37.5} rx={2} ry={3} fill={TERRA} />
        <Ellipse cx={44.5} cy={38} rx={2} ry={3} fill={TERRA} />
      </>
    ),
    layers: [
      {
        id: 'knife',
        node: () => (
          <>
            <Path d="M10 22 L30 22 Q34 22 34 18.5 L34 17 L10 17 Q7 19.5 10 22 Z" fill={COCOA} />
            <Path d="M34 19.5 L44 19.5 Q45.5 17.5 44 15.5 L36 15.5 Z" fill={COCOA} />
            <Path d="M15 19.5 h12" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  stir: {
    base: () => (
      <>
        <Path d="M8 26 L40 26 Q40 41 24 41 Q8 41 8 26 Z" fill={BLUE} />
        <Path d="M13 31 Q24 34 35 31" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M43 24 C46 21 45 17 45 17 C42 17 40 20 41 23 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [
      {
        id: 'spoon',
        node: () => (
          <>
            <Path d="M27 6 L23.5 24" stroke={COCOA} fill="none" strokeWidth={3.4} />
            <Ellipse cx={23} cy={27} rx={4} ry={5} fill={COCOA} />
          </>
        ),
      },
    ],
  },

  simmer: {
    base: () => (
      <>
        <Path d="M11 24 L37 24 L36 38 Q36 41 32 41 L16 41 Q12 41 12 38 Z" fill={SPRUCE} />
        <Path d="M17 29 l1 7" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M8 25 L11 25 M37 25 L40 25" stroke={SPRUCE} fill="none" strokeWidth={3.4} />
      </>
    ),
    layers: [
      { id: 'wisp1', node: () => <Path d="M17 16 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
      { id: 'wisp2', node: () => <Path d="M24 15 q2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
      { id: 'wisp3', node: () => <Path d="M31 16 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
      {
        id: 'lid',
        node: () => (
          <>
            <Path d="M11 22 Q11 18 24 18 Q37 18 37 22 Z" fill={SPRUCE} />
            <Path d="M22 15.5 h4" stroke={SPRUCE} fill="none" strokeWidth={3.4} />
          </>
        ),
      },
    ],
  },

  flip: {
    base: () => null,
    layers: [
      {
        id: 'pancake',
        node: () => (
          <>
            <Ellipse cx={21} cy={27} rx={8} ry={3.4} fill={OCHRE} />
            <Path d="M16 26 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
      {
        id: 'pan',
        node: () => (
          <>
            <Path d="M8 31 L34 31 Q34 37 28 37 L14 37 Q8 37 8 31 Z" fill={COCOA} />
            <Path d="M34 32.5 L44 30.5" stroke={COCOA} fill="none" strokeWidth={3.6} />
            <Path d="M13 34 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  knead: {
    base: () => <Path d="M6 39 L42 39" stroke={COCOA} fill="none" strokeWidth={3.4} />,
    layers: [
      {
        id: 'dough',
        node: () => (
          <>
            <Path d="M12 36 Q12 22 24 22 Q36 22 36 36 Z" fill={OCHRE} />
            <Path d="M19 28 l-2 5" stroke={CREAM} fill="none" strokeWidth={2} />
            <Path d="M27 28 l-2 5" stroke={CREAM} fill="none" strokeWidth={2} />
            <Path d="M24 21 C27 18 31 19 31 19 C31 22 28 24 25 23 Z" fill={LEAF} stroke="none" />
          </>
        ),
      },
    ],
  },

  season: {
    base: () => (
      <>
        <Path d="M10 38 L38 38 Q38 43 32 43 L16 43 Q10 43 10 38 Z" fill={BRICK} />
        <Path d="M16 40.5 h6" stroke={CREAM} fill="none" strokeWidth={2} />
      </>
    ),
    layers: [
      { id: 'flake1', node: () => <Circle cx={28} cy={21} r={1.6} fill={OLIVE} stroke="none" /> },
      { id: 'flake2', node: () => <Circle cx={24} cy={23} r={1.4} fill={OLIVE} stroke="none" /> },
      { id: 'flake3', node: () => <Circle cx={31} cy={24} r={1.3} fill={OLIVE} stroke="none" /> },
      {
        id: 'jar',
        node: () => (
          <>
            <Path d="M27 8 Q27 6 29 6 L37 6 Q39 6 39 8 L39 16 Q39 18 37 18 L29 18 Q27 18 27 16 Z" fill={OLIVE} />
            <Path d="M30 10 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  pour: {
    base: () => (
      <>
        <Path d="M12 32 L36 32 Q36 42 24 42 Q12 42 12 32 Z" fill={OCHRE} />
        <Path d="M17 35 Q24 37.5 31 35" stroke={CREAM} fill="none" strokeWidth={2} />
      </>
    ),
    layers: [
      { id: 'drop1', node: () => <Circle cx={26} cy={18} r={1.6} fill={BLUE} stroke="none" /> },
      { id: 'drop2', node: () => <Circle cx={24.5} cy={21} r={1.4} fill={BLUE} stroke="none" /> },
      {
        id: 'jug',
        node: () => (
          <>
            <Path d="M8 7 Q8 5.5 9.5 5.5 L20 5.5 Q21.5 5.5 21.5 7 L21.5 15 Q21.5 16.5 20 16.5 L9.5 16.5 Q8 16.5 8 15 Z" fill={BLUE} />
            <Path d="M21.5 8 L25 10 L21.5 12 Z" fill={BLUE} />
            <Path d="M11 9 h6" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  grate: {
    base: () => (
      <>
        <Path d="M18 14 L30 14 L33 40 L15 40 Z" fill={SPRUCE} />
        <Path d="M21 20 l0.6 4 M26 20 l0.6 4 M22 28 l0.6 4 M27 28 l0.6 4" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M20 14 Q20 9 24 9 Q28 9 28 14" stroke={SPRUCE} fill="none" strokeWidth={3} />
      </>
    ),
    layers: [
      {
        id: 'food',
        node: () => (
          <>
            <Path d="M31 8 Q31 6.5 32.5 6.5 L39 6.5 Q40.5 6.5 40.5 8 L40.5 12 Q40.5 13.5 39 13.5 L32.5 13.5 Q31 13.5 31 12 Z" fill={OCHRE} />
            <Path d="M34 9 h4" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  roll: {
    base: () => (
      <>
        <Path d="M6 41 L42 41" stroke={COCOA} fill="none" strokeWidth={3.4} />
        <Ellipse cx={24} cy={36} rx={14} ry={4} fill={OCHRE} />
        <Path d="M18 35.5 h5" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M40 32 C43 29 42 25 42 25 C39 25 37 28 38 31 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [
      {
        id: 'pin',
        node: () => (
          <>
            <Path d="M13 22 Q10 22 10 25 Q10 28 13 28 L35 28 Q38 28 38 25 Q38 22 35 22 Z" fill={COCOA} />
            <Path d="M4 25 L10 25 M38 25 L44 25" stroke={COCOA} fill="none" strokeWidth={3.4} />
            <Path d="M17 25 h8" stroke={CREAM} fill="none" strokeWidth={2} />
          </>
        ),
      },
    ],
  },

  rest: {
    base: () => (
      <>
        <Path d="M10 26 L38 26 Q38 40 24 40 Q10 40 10 26 Z" fill={PLUM} />
        <Path d="M15 30 Q24 33 33 30" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M41 24 C44 21 43 17 43 17 C40 17 38 20 39 23 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [
      { id: 'wisp', node: () => <Path d="M24 21 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
    ],
  },

  preheat: {
    base: () => (
      <>
        <Path d="M10 12 Q10 9 13 9 L35 9 Q38 9 38 12 L38 38 Q38 41 35 41 L13 41 Q10 41 10 38 Z" fill={BRICK} />
        <Circle cx={17} cy={13.5} r={1.5} fill={CREAM} stroke="none" />
        <Circle cx={23} cy={13.5} r={1.5} fill={CREAM} stroke="none" />
        <Path d="M15 20 L33 20 L33 34 L15 34 Z" fill={CREAM} stroke="none" />
      </>
    ),
    layers: [
      { id: 'wave1', node: () => <Path d="M21 31 q-1.5 -3 0 -6" stroke={BRICK} fill="none" strokeWidth={2.2} /> },
      { id: 'wave2', node: () => <Path d="M27 31 q1.5 -3 0 -6" stroke={BRICK} fill="none" strokeWidth={2.2} /> },
    ],
  },

  mash: {
    base: () => (
      <>
        <Path d="M12 28 L36 28 L35 40 Q35 42 32 42 L16 42 Q13 42 13 40 Z" fill={SPRUCE} />
        <Path d="M18 32 l1 6" stroke={CREAM} fill="none" strokeWidth={2} />
      </>
    ),
    layers: [
      {
        id: 'masher',
        node: () => (
          <>
            <Path d="M24 6 L24 18" stroke={COCOA} fill="none" strokeWidth={3.4} />
            <Path d="M16 20 L32 20" stroke={COCOA} fill="none" strokeWidth={3} />
            <Path d="M17 20 v5 M21 20 v5 M25 20 v5 M29 20 v5" stroke={COCOA} fill="none" strokeWidth={2.4} />
          </>
        ),
      },
    ],
  },

  // -------- stage fallbacks (3) --------
  prep: {
    base: () => (
      <>
        <Path d="M8 31 Q8 28 11 28 L37 28 Q40 28 40 31 Q40 34 37 34 L11 34 Q8 34 8 31 Z" fill={COCOA} />
        <Circle cx={18} cy={22} r={5} fill={BRICK} />
        <Path d="M18 17 L18 14 L20.5 16 Z" fill={LEAF} stroke="none" />
        <Path d="M30 26 v-8 M30 21 l-4 -3 M30 21 l4 -3" stroke={LEAF} fill="none" strokeWidth={2.4} />
      </>
    ),
    layers: [],
  },

  cooking: {
    base: () => (
      <>
        <Path d="M11 22 L37 22 L36 38 Q36 41 32 41 L16 41 Q12 41 12 38 Z" fill={SPRUCE} />
        <Path d="M17 27 l1 8" stroke={CREAM} fill="none" strokeWidth={2} />
        <Path d="M8 23 L11 23 M37 23 L40 23" stroke={SPRUCE} fill="none" strokeWidth={3.4} />
      </>
    ),
    layers: [
      { id: 'wisp', node: () => <Path d="M24 18 q-2 -3.5 0 -7" stroke={STEAM} fill="none" strokeWidth={2.4} /> },
    ],
  },

  finishing: {
    base: () => (
      <>
        <Ellipse cx={24} cy={34} rx={15} ry={5} fill={BRICK} />
        <Ellipse cx={24} cy={33.5} rx={10} ry={3} fill={CREAM} stroke="none" />
        <Ellipse cx={24} cy={30} rx={7} ry={3.6} fill={OLIVE} />
        <Path d="M25 26 C28 23 32 24 32 24 C32 27 29 29 26 28 Z" fill={LEAF} stroke="none" />
      </>
    ),
    layers: [],
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/mobile`): `npm test -- brandGlyphs.technique`
Expected: PASS. Also run `npm test -- brandGlyphs` — the EXISTING family test must still pass (this file doesn't touch `FOOD_TONE`, so it should).

- [ ] **Step 5: Typecheck and commit**

Run (from `apps/mobile`): `npx tsc --noEmit` — expected: no errors.

```bash
git add apps/mobile/src/components/brandGlyphs.technique.tsx apps/mobile/src/components/brandGlyphs.technique.test.ts
git commit -m "feat(brand): technique + stage glyph family for cook mode"
```

---

### Task 4: Motion specs (`techniqueMotion.ts`)

**Files:**
- Create: `apps/mobile/src/components/techniqueMotion.ts`
- Test: `apps/mobile/src/components/techniqueMotion.test.ts`

The keyframes below reproduce the approved CSS loops from `cook-motion-mockups.html`, including the revised two-beat knead. Contract rules (enforced by the tests): within one layer every keyframe defines the SAME property set; first keyframe `at: 0` (the rest pose — also the reduce-motion freeze frame); last keyframe `at: 1`; `at` strictly ascending; duration 1000–2500 ms.

- [ ] **Step 1: Write the failing spec-sanity test**

Create `apps/mobile/src/components/techniqueMotion.test.ts`:

```ts
import { STAGES, TECHNIQUES, TECHNIQUE_GLYPHS } from './brandGlyphs.technique';
import { TECHNIQUE_MOTION } from './techniqueMotion';

const ALL_IDS = [...TECHNIQUES, ...STAGES];

describe('technique motion specs', () => {
  it('covers every technique and stage id exactly', () => {
    expect(Object.keys(TECHNIQUE_MOTION).sort()).toEqual([...ALL_IDS].sort());
  });

  it('durations are calm: 1000-2500ms', () => {
    for (const id of ALL_IDS) {
      const d = TECHNIQUE_MOTION[id].durationMs;
      expect(d).toBeGreaterThanOrEqual(1000);
      expect(d).toBeLessThanOrEqual(2500);
    }
  });

  it('every motion layer targets a real glyph layer, and vice versa', () => {
    for (const id of ALL_IDS) {
      const glyphLayerIds = TECHNIQUE_GLYPHS[id].layers.map((l) => l.id).sort();
      const motionLayerIds = Object.keys(TECHNIQUE_MOTION[id].layers).sort();
      expect(motionLayerIds).toEqual(glyphLayerIds);
    }
  });

  it('keyframes: same property set per layer, at 0→1 strictly ascending', () => {
    for (const id of ALL_IDS) {
      for (const [layerId, motion] of Object.entries(TECHNIQUE_MOTION[id].layers)) {
        const kfs = motion.keyframes;
        const label = `${id}/${layerId}`;
        expect(kfs.length).toBeGreaterThanOrEqual(2);
        expect(kfs[0].at).toBe(0);
        expect(kfs[kfs.length - 1].at).toBe(1);
        const firstKeys = Object.keys(kfs[0]).sort();
        for (let i = 0; i < kfs.length; i++) {
          expect({ label, keys: Object.keys(kfs[i]).sort() }).toEqual({ label, keys: firstKeys });
          if (i > 0) expect(kfs[i].at).toBeGreaterThan(kfs[i - 1].at);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/mobile`): `npm test -- techniqueMotion`
Expected: FAIL — cannot find module `./techniqueMotion`.

- [ ] **Step 3: Implement the specs**

Create `apps/mobile/src/components/techniqueMotion.ts`:

```ts
/**
 * techniqueMotion — declarative loop specs for the technique glyphs.
 *
 * One spec per glyph id; each animatable layer gets keyframes over
 * transform/opacity ONLY (native-driver-safe). TechniqueGlyph drives every
 * spec with a single looping 0→1 progress value, so a keyframe's `at` is a
 * fraction of durationMs. Stagger (steam wisps, falling flakes) is encoded
 * as hold-then-play keyframes rather than per-layer delays.
 *
 * Contract (enforced by techniqueMotion.test.ts): within a layer, every
 * keyframe defines the same property set; first at=0 (rest pose — also the
 * reduce-motion freeze frame); last at=1; `at` strictly ascending.
 */
import type { TechniqueGlyphName } from './brandGlyphs.technique';

export interface MotionKeyframe {
  /** 0..1 fraction of the loop. */
  at: number;
  /** Translations are in 48-box glyph units; TechniqueGlyph scales them to the rendered size. */
  translateX?: number;
  translateY?: number;
  /** Degrees. */
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}

export interface LayerMotion {
  /** transform-origin within the glyph box, CSS-style percentages (of the WHOLE 48-box). */
  origin?: string;
  keyframes: MotionKeyframe[];
}

export interface MotionSpec {
  durationMs: number;
  layers: Record<string, LayerMotion>;
}

export const TECHNIQUE_MOTION: Record<TechniqueGlyphName, MotionSpec> = {
  chop: {
    durationMs: 1100,
    layers: {
      knife: {
        origin: '19% 41%',
        keyframes: [
          { at: 0, rotate: 0, translateY: 0 },
          { at: 0.45, rotate: -13, translateY: -1.5 },
          { at: 0.65, rotate: 1.5, translateY: 0 },
          { at: 1, rotate: 0, translateY: 0 },
        ],
      },
    },
  },

  stir: {
    durationMs: 1600,
    layers: {
      spoon: {
        origin: '48% 16%',
        keyframes: [
          { at: 0, translateX: 3, translateY: 0, rotate: 6 },
          { at: 0.25, translateX: 0, translateY: 1.5, rotate: 0 },
          { at: 0.5, translateX: -3, translateY: 0, rotate: -6 },
          { at: 0.75, translateX: 0, translateY: -1, rotate: 0 },
          { at: 1, translateX: 3, translateY: 0, rotate: 6 },
        ],
      },
    },
  },

  simmer: {
    durationMs: 2200,
    layers: {
      wisp1: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.27, translateY: -0.5, opacity: 0.85 },
          { at: 0.8, translateY: -7, opacity: 0 },
          { at: 1, translateY: -7, opacity: 0 },
        ],
      },
      wisp2: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.32, translateY: 2, opacity: 0 },
          { at: 0.55, translateY: -0.5, opacity: 0.85 },
          { at: 1, translateY: -7, opacity: 0 },
        ],
      },
      wisp3: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.6, translateY: 2, opacity: 0 },
          { at: 0.8, translateY: -0.5, opacity: 0.85 },
          { at: 1, translateY: -5, opacity: 0 },
        ],
      },
      lid: {
        origin: '50% 46%',
        keyframes: [
          { at: 0, translateY: 0, rotate: 0 },
          { at: 0.86, translateY: 0, rotate: 0 },
          { at: 0.9, translateY: -1.2, rotate: -1.2 },
          { at: 0.94, translateY: -0.6, rotate: 1.2 },
          { at: 1, translateY: 0, rotate: 0 },
        ],
      },
    },
  },

  flip: {
    durationMs: 1800,
    layers: {
      pancake: {
        origin: '44% 56%',
        keyframes: [
          { at: 0, translateY: 0, rotate: 0 },
          { at: 0.12, translateY: 0, rotate: 0 },
          { at: 0.46, translateY: -11, rotate: 178 },
          { at: 0.72, translateY: 0, rotate: 360 },
          { at: 1, translateY: 0, rotate: 360 },
        ],
      },
      pan: {
        origin: '79% 69%',
        keyframes: [
          { at: 0, rotate: 0, translateY: 0 },
          { at: 0.08, rotate: 0, translateY: 0 },
          { at: 0.14, rotate: -5, translateY: 1 },
          { at: 0.3, rotate: 2, translateY: 0 },
          { at: 0.46, rotate: 0, translateY: 0 },
          { at: 1, rotate: 0, translateY: 0 },
        ],
      },
    },
  },

  knead: {
    durationMs: 2400,
    layers: {
      dough: {
        origin: '50% 75%',
        keyframes: [
          { at: 0, scaleX: 1, scaleY: 1, rotate: 0, translateX: 0 },
          { at: 0.18, scaleX: 1.14, scaleY: 0.84, rotate: -2, translateX: 1.5 },
          { at: 0.34, scaleX: 0.97, scaleY: 1.03, rotate: 0, translateX: 0 },
          { at: 0.48, scaleX: 1, scaleY: 1, rotate: 0, translateX: 0 },
          { at: 0.66, scaleX: 1.14, scaleY: 0.84, rotate: 2, translateX: -1.5 },
          { at: 0.82, scaleX: 0.97, scaleY: 1.03, rotate: 0, translateX: 0 },
          { at: 1, scaleX: 1, scaleY: 1, rotate: 0, translateX: 0 },
        ],
      },
    },
  },

  season: {
    durationMs: 2400,
    layers: {
      jar: {
        origin: '76% 18%',
        keyframes: [
          { at: 0, rotate: 0 },
          { at: 0.35, rotate: -14 },
          { at: 0.7, rotate: -14 },
          { at: 1, rotate: 0 },
        ],
      },
      flake1: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.34, translateY: 0, opacity: 0 },
          { at: 0.42, translateY: 3, opacity: 1 },
          { at: 0.72, translateY: 13, opacity: 0 },
          { at: 1, translateY: 13, opacity: 0 },
        ],
      },
      flake2: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.44, translateY: 0, opacity: 0 },
          { at: 0.52, translateY: 3, opacity: 1 },
          { at: 0.82, translateY: 13, opacity: 0 },
          { at: 1, translateY: 13, opacity: 0 },
        ],
      },
      flake3: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.54, translateY: 0, opacity: 0 },
          { at: 0.62, translateY: 3, opacity: 1 },
          { at: 0.92, translateY: 13, opacity: 0 },
          { at: 1, translateY: 13, opacity: 0 },
        ],
      },
    },
  },

  pour: {
    durationMs: 2000,
    layers: {
      jug: {
        origin: '30% 23%',
        keyframes: [
          { at: 0, rotate: 0 },
          { at: 0.25, rotate: -10 },
          { at: 0.75, rotate: -10 },
          { at: 1, rotate: 0 },
        ],
      },
      drop1: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.28, translateY: 0, opacity: 0 },
          { at: 0.36, translateY: 3, opacity: 1 },
          { at: 0.66, translateY: 12, opacity: 0 },
          { at: 1, translateY: 12, opacity: 0 },
        ],
      },
      drop2: {
        keyframes: [
          { at: 0, translateY: 0, opacity: 0 },
          { at: 0.42, translateY: 0, opacity: 0 },
          { at: 0.5, translateY: 3, opacity: 1 },
          { at: 0.8, translateY: 12, opacity: 0 },
          { at: 1, translateY: 12, opacity: 0 },
        ],
      },
    },
  },

  grate: {
    durationMs: 1400,
    layers: {
      food: {
        keyframes: [
          { at: 0, translateX: 0, translateY: 0, opacity: 1 },
          { at: 0.45, translateX: -2.5, translateY: 4, opacity: 1 },
          { at: 0.55, translateX: -2.5, translateY: 4, opacity: 0 },
          { at: 0.65, translateX: 0, translateY: 0, opacity: 0 },
          { at: 0.75, translateX: 0, translateY: 0, opacity: 1 },
          { at: 1, translateX: 0, translateY: 0, opacity: 1 },
        ],
      },
    },
  },

  roll: {
    durationMs: 2000,
    layers: {
      pin: {
        keyframes: [
          { at: 0, translateX: -4, translateY: 0 },
          { at: 0.5, translateX: 4, translateY: -0.8 },
          { at: 1, translateX: -4, translateY: 0 },
        ],
      },
    },
  },

  rest: {
    durationMs: 2500,
    layers: {
      wisp: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.3, translateY: -0.5, opacity: 0.6 },
          { at: 0.85, translateY: -6, opacity: 0 },
          { at: 1, translateY: -6, opacity: 0 },
        ],
      },
    },
  },

  preheat: {
    durationMs: 2000,
    layers: {
      wave1: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.3, translateY: 0, opacity: 0.9 },
          { at: 0.8, translateY: -4, opacity: 0 },
          { at: 1, translateY: -4, opacity: 0 },
        ],
      },
      wave2: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.35, translateY: 2, opacity: 0 },
          { at: 0.6, translateY: 0, opacity: 0.9 },
          { at: 1, translateY: -4, opacity: 0 },
        ],
      },
    },
  },

  mash: {
    durationMs: 1300,
    layers: {
      masher: {
        keyframes: [
          { at: 0, translateY: 0 },
          { at: 0.4, translateY: 4 },
          { at: 0.55, translateY: 4 },
          { at: 0.85, translateY: 0 },
          { at: 1, translateY: 0 },
        ],
      },
    },
  },

  prep: { durationMs: 2000, layers: {} },

  cooking: {
    durationMs: 2500,
    layers: {
      wisp: {
        keyframes: [
          { at: 0, translateY: 2, opacity: 0 },
          { at: 0.3, translateY: -0.5, opacity: 0.7 },
          { at: 0.85, translateY: -6, opacity: 0 },
          { at: 1, translateY: -6, opacity: 0 },
        ],
      },
    },
  },

  finishing: { durationMs: 2000, layers: {} },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/mobile`): `npm test -- techniqueMotion`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run (from `apps/mobile`): `npx tsc --noEmit` — expected: no errors.

```bash
git add apps/mobile/src/components/techniqueMotion.ts apps/mobile/src/components/techniqueMotion.test.ts
git commit -m "feat(brand): declarative motion specs for technique glyphs"
```

---

### Task 5: The renderer (`TechniqueGlyph.tsx`)

**Files:**
- Create: `apps/mobile/src/components/TechniqueGlyph.tsx`

No unit test — the repo has no component-render test setup, and this component is all Animated wiring; it's verified by typecheck here and by manual QA in Task 7.

- [ ] **Step 1: Implement the component**

Create `apps/mobile/src/components/TechniqueGlyph.tsx`:

```tsx
/**
 * TechniqueGlyph — renders one animated technique/stage glyph for Cook Mode.
 *
 * The glyph's static base is one Svg; each animatable layer is its OWN
 * absolutely-positioned Svg inside an Animated.View, so every loop runs
 * transform/opacity on the NATIVE driver (animating svg props directly would
 * stay on the JS thread). One 0→1 progress value per glyph drives all layers
 * via interpolation from the declarative keyframes in techniqueMotion.
 *
 * Decorative: hidden from assistive tech (the step text carries meaning) —
 * same posture as BrandIcon. Honors OS reduce-motion by never starting the
 * loop: progress stays 0, which every spec defines as the rest pose.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { G } from 'react-native-svg';

import { TECHNIQUE_GLYPHS, type TechniqueGlyphName } from './brandGlyphs.technique';
import { TECHNIQUE_MOTION, type LayerMotion, type MotionKeyframe } from './techniqueMotion';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

type NumericKey = 'translateX' | 'translateY' | 'scaleX' | 'scaleY' | 'opacity';

/**
 * Build the Animated style for one layer. Keyframe translations are in
 * 48-box glyph units; `unit` (= renderedSize / 48) scales them to points.
 */
function layerStyle(progress: Animated.Value, motion: LayerMotion, unit: number) {
  const kfs = motion.keyframes;
  const inputRange = kfs.map((k) => k.at);
  const has = (key: keyof MotionKeyframe) => kfs[0][key] !== undefined;
  const num = (key: NumericKey, scale = 1) =>
    progress.interpolate({ inputRange, outputRange: kfs.map((k) => (k[key] as number) * scale) });

  const transform: Animated.WithAnimatedArray<object> = [];
  if (has('translateX')) transform.push({ translateX: num('translateX', unit) });
  if (has('translateY')) transform.push({ translateY: num('translateY', unit) });
  if (has('rotate'))
    transform.push({
      rotate: progress.interpolate({ inputRange, outputRange: kfs.map((k) => `${k.rotate}deg`) }),
    });
  if (has('scaleX')) transform.push({ scaleX: num('scaleX') });
  if (has('scaleY')) transform.push({ scaleY: num('scaleY') });

  return {
    transform,
    ...(has('opacity') ? { opacity: num('opacity') } : null),
  };
}

export function TechniqueGlyph({ name, size = 96 }: { name: TechniqueGlyphName; size?: number }) {
  const def = TECHNIQUE_GLYPHS[name];
  const spec = TECHNIQUE_MOTION[name];
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const shouldAnimate = !reduced && def.layers.length > 0;
  useEffect(() => {
    progress.setValue(0);
    if (!shouldAnimate) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: spec.durationMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldAnimate, name, progress, spec.durationMs]);

  const unit = size / 48;
  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          {def.base()}
        </G>
      </Svg>
      {def.layers.map((layer) => {
        const motion = spec.layers[layer.id];
        return (
          <Animated.View
            key={layer.id}
            style={[
              StyleSheet.absoluteFill,
              motion?.origin ? { transformOrigin: motion.origin } : null,
              motion ? layerStyle(progress, motion, unit) : null,
            ]}
          >
            <Svg width={size} height={size} viewBox="0 0 48 48">
              <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                {layer.node()}
              </G>
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Typecheck and run the full glyph test set**

Run (from `apps/mobile`): `npx tsc --noEmit` — expected: no errors. (If `transformOrigin` errors on the style type, the RN version predates 0.73 — stop and flag it rather than casting; the spec's origin approach would need the translate-sandwich fallback instead.)

Run: `npm test -- brandGlyphs` and `npm test -- techniqueMotion` — expected: PASS (unchanged).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/TechniqueGlyph.tsx
git commit -m "feat(brand): TechniqueGlyph layered native-driver renderer"
```

---

### Task 6: Cook Mode wiring

**Files:**
- Modify: `apps/mobile/src/features/recipes/CookModeView.tsx` (interface ~line 33, flatten ~line 108, render ~line 361, styles ~line 589)

- [ ] **Step 1: Carry `technique` through `FlatStep`**

In `CookModeView.tsx`, extend the `FlatStep` interface (line ~33):

```ts
interface FlatStep {
  group: string;
  step: string;
  ingredients: string[];
  lengthMinutes: number | null;
  technique: string | null;
}
```

And in the `steps` useMemo's `flat.push` (line ~112), add the field:

```ts
        flat.push({
          group: group.name,
          step: s.step,
          ingredients: s.ingredients ?? [],
          lengthMinutes: s.lengthMinutes ?? null,
          technique: s.technique ?? null,
        });
```

- [ ] **Step 2: Add the imports and the hero**

Add imports (with the existing ones at the top):

```ts
import { TechniqueGlyph } from '../../components/TechniqueGlyph';
import { resolveStepGlyph } from './matchTechnique';
```

In the step-phase render, insert the hero between the `stepHead` view and the step text — i.e. directly before `<Text style={styles.stepText}>{current.step}</Text>` (line ~371):

```tsx
            <View style={styles.hero}>
              <TechniqueGlyph
                name={resolveStepGlyph(current.technique, current.step, idx, total)}
                size={88}
              />
            </View>
```

(No `useMemo` needed — `resolveStepGlyph` is one regex pass over one step's text.)

- [ ] **Step 3: Add the style**

In the `styles` object, next to the other step styles (after `stepHead`, line ~589):

```ts
  // The technique hero — a constant slot so the step text never jumps
  // between steps (glanceability mid-cook, per the design spec).
  hero: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceAlt,
    marginBottom: tokens.space(4),
  },
```

- [ ] **Step 4: Verify**

Run (from `apps/mobile`): `npx tsc --noEmit` — expected: no errors.
Run: `npm test` — expected: full suite PASS.

Note on the spec's "pause while the finish/confirm modal is up": CookModeView has no internal confirm modal — finishing calls `onFinish()` and the whole Modal unmounts, which stops the loops via the `useEffect` cleanup. Nothing extra to build; confirm during QA that leaving cook mode kills the animation.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/recipes/CookModeView.tsx
git commit -m "feat(cook): animated technique glyph hero in cook-mode steps"
```

---

### Task 7: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Run every gate**

From `apps/mobile`: `npm test` — expected: PASS, including the pre-existing suites (`retailBarcode`, `curatedVariants`, `brandGlyphs`).
From `apps/mobile`: `npx tsc --noEmit` — expected: clean.
From repo root: `npm run lint` — expected: clean (this gates CI).
From repo root: `node data/recipes/validate.mjs data/recipes/curated.recipes.json` and `node data/recipes/validate.mjs --variants data/recipes/curated.variants.json` — expected: both `PASS`.

- [ ] **Step 2: On-device / simulator QA checklist**

Launch the dev client and open any recipe's Cook Mode. Verify:

1. **Technique match:** a step containing "dice"/"chop" shows the rocking knife; "stir"/"whisk" shows the sweeping spoon; "simmer"/"boil" shows steam + lid jiggle.
2. **Stage fallback:** a step like "Transfer to a serving plate" (no technique verb) shows the stage glyph — prep art on step 1, plated-dish art on the last step, gentle-steam pot in between.
3. **Layout stability:** stepping forward/back never shifts the step text vertically — the hero slot is constant height.
4. **Loop hygiene:** leaving cook mode (X or finishing) stops all animation; re-entering restarts cleanly; switching steps swaps the glyph without a stuck mid-pose frame.
5. **Reduce motion:** enable it in OS settings (iOS: Settings → Accessibility → Motion) — glyphs render frozen on their rest pose.
6. **Curated + variants:** open a curated recipe, switch to a device variant, enter cook mode — heroes render from the variant's steps.
7. **Dark mode:** glyph tones sit on `surfaceAlt` in dark theme — confirm nothing is illegible (tones are theme-independent brand constants; the stage behind them changes).
8. **Screen reader spot-check:** with VoiceOver, the hero is skipped; focus goes from the step label to the step text.
9. **Visual polish pass:** compare each of the 12 techniques against `cook-motion-mockups.html`; nudge any SVG coordinates that render awkwardly at 88 pt (shape tweaks are expected and allowed here — commit them as `fix(brand): glyph shape polish`).

- [ ] **Step 3: Authoring follow-up (out of plan scope, note only)**

When a real recipe's matcher result is wrong, the fix is authoring `"technique": "<id>"` (or `"none"`) on that step in `data/recipes/curated.recipes.json` / `curated.variants.json`, re-running the validator, and syncing the bundle copy. No such edits are part of this plan.

---

## Self-review notes

- **Spec coverage:** hero slot (Task 6), constant fallback (Task 2 resolution + Task 3 stage glyphs), 12 techniques (Tasks 3–4), hybrid matching + `"none"` (Tasks 1–2), native-driver/no-new-deps (Task 5), reduce-motion + a11y (Task 5, QA 5/8), validation + two-copy posture (Task 1), all spec test bullets (Tasks 1–4), manual QA list (Task 7). The spec's "pause during confirm modal" resolves to unmount cleanup — addressed explicitly in Task 6 Step 4.
- **Deviation from spec, intentional:** glyph layers take no `Paint` argument — technique scenes are multi-tone (carrot + knife), so tones are baked per glyph from `brandPalette`. The spec's "layer a function of Paint" was written before the scenes were drawn; this plan supersedes it.
- **Type consistency:** `TechniqueGlyphName = Technique | Stage` is owned by `brandGlyphs.technique.tsx` and imported everywhere; layer ids in Task 3 (`knife`, `spoon`, `wisp1-3`, `lid`, `pancake`, `pan`, `dough`, `jar`, `flake1-3`, `jug`, `drop1-2`, `food`, `pin`, `wisp`, `wave1-2`, `masher`) match Task 4's spec keys one-to-one (enforced by the Task 4 test).
