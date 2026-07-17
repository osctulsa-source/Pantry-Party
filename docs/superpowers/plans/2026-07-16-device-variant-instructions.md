# Device-Variant Recipe Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curated recipes carry full per-device instruction variants (steps + readyInMinutes); the recipe detail screen auto-shows the variant matching tonight's picked device with an in-recipe switcher, and variant availability counts as a device match for Cook-tab ranking.

**Architecture:** Sidecar data file `data/recipes/curated.variants.json` (+ bundle copy in `apps/mobile/src/data/curated/`) validated against the base recipes by an extended `validate.mjs --variants` mode. A single lookup module `curatedVariants.ts` parses the bundle defensively and feeds both the detail-screen switcher and the ranking union. No changes to `packages/core` — variant device ids are unioned into the detected-devices set at the call site.

**Tech Stack:** React Native (Expo), TypeScript, Jest (apps/mobile), plain-Node validator scripts (`.mjs`), bundled JSON data.

**Spec:** `docs/superpowers/specs/2026-07-16-device-variant-instructions-design.md`

**Verification commands** (per repo gotchas — root `tsc -b` is broken):
- Typecheck: `cd apps/mobile; npx tsc --noEmit`
- Lint (gates CI): `npm run lint` from repo root
- Mobile tests: `cd apps/mobile; npm test`

---

### Task 1: Empty datasets + authoring spec addendum

**Files:**
- Create: `data/recipes/curated.variants.json`
- Create: `apps/mobile/src/data/curated/curated.variants.json`
- Create: `data/recipes/SPEC-VARIANTS.md`

- [ ] **Step 1: Create both empty variant datasets**

Both files get identical content (the two-copy rule from `curatedSource.ts` applies to variants too):

```json
[]
```

- [ ] **Step 2: Write the authoring spec addendum**

Create `data/recipes/SPEC-VARIANTS.md`:

```markdown
# Pantry Party device-variant spec (v1) — addendum to SPEC.md

You are authoring DEVICE VARIANTS: alternate instruction sets that convert an
existing curated recipe to a different cooking device. Read SPEC.md first —
every voice and legal rule there applies verbatim.

## Schema (per variant — every field required)

```ts
{
  recipeId: number;           // id of the base recipe in curated.recipes.json
  device: "crockpot" | "instantpot" | "airfryer" | "sheetpan" | "microwave"
        | "nocook" | "stove" | "oven" | "grill" | "griddle";
  readyInMinutes: number;     // realistic total for THIS device, 5-600
  steps: Array<{              // identical step schema to SPEC.md
    number: number;           // 1..N sequential
    step: string;             // one clear action sentence; doneness cues
    ingredients: string[];    // MUST match (or be contained in) a BASE recipe
                              // ingredient name — variants share the base list
    equipment: string[];      // 0-2 items; name the device naturally
                              // ("slow cooker", "air fryer basket")
    lengthMinutes: number | null;  // null or 1-600 (crockpot lows run long)
  }>;                         // 4-12 steps
}
```

## Rules beyond SPEC.md
- The ingredient LIST is shared with the base recipe. If the device needs less
  liquid, say it in the step ("add only half the broth — slow cookers don't
  evaporate"). Never reference an ingredient the base recipe doesn't have.
- One entry per (recipeId, device) pair. Never author a variant for a device
  the base recipe already natively uses.
- Conversions must be genuinely good cooking, never forced. If a dish would be
  bad on a device, skip it — the coverage matrix records the skip.
- `readyInMinutes` reflects reality: crockpot chilis are 360-480, not 45.
- Equipment strings mention the device so keyword detection stays consistent.

## Workflow for your batch
1. Write your JSON array to your assigned file in data/recipes/variants-batches/.
2. Run: `node data/recipes/validate.mjs --variants <your file>` with Bash.
3. Fix every ERROR and re-run until PASS. Then report: variant count,
   any pairings you skipped as not-sensible (with one-line reasons), PASS line.
```

- [ ] **Step 3: Commit**

```bash
git add data/recipes/curated.variants.json apps/mobile/src/data/curated/curated.variants.json data/recipes/SPEC-VARIANTS.md
git commit -m "feat(recipes): empty device-variants datasets + authoring spec"
```

---

### Task 2: Validator `--variants` mode

**Files:**
- Modify: `data/recipes/validate.mjs`
- Create: `data/recipes/fixtures/base.good.json`
- Create: `data/recipes/fixtures/variants.good.json`
- Create: `data/recipes/fixtures/variants.bad.json`

The validator is a plain script with no test runner — TDD here means fixture files first, then the implementation, then verifying ERROR/PASS output.

- [ ] **Step 1: Write the fixtures (the failing "tests")**

`data/recipes/fixtures/base.good.json` — one minimal valid base recipe the variant fixtures reference:

```json
[
  {
    "id": 9000001,
    "title": "Test Beef Chili",
    "image": "",
    "difficulty": "easy",
    "mealType": "main course",
    "cuisines": [],
    "readyInMinutes": 45,
    "servings": 4,
    "vegetarian": false,
    "vegan": false,
    "glutenFree": true,
    "healthScore": null,
    "sourceUrl": "",
    "sourceName": "Pantry Party Kitchen",
    "summary": "A weeknight chili that tastes like it simmered all Sunday afternoon.",
    "ingredients": [
      { "name": "ground beef", "original": "1 lb ground beef", "amount": 1, "unit": "lb" },
      { "name": "onion", "original": "1 yellow onion, diced", "amount": 1, "unit": "" },
      { "name": "chili powder", "original": "2 tbsp chili powder", "amount": 2, "unit": "tbsp" },
      { "name": "beef broth", "original": "2 cups beef broth", "amount": 2, "unit": "cup" }
    ],
    "instructions": [
      {
        "name": "",
        "steps": [
          { "number": 1, "step": "Brown the ground beef in a large pot over medium-high heat, about 6 minutes.", "ingredients": ["ground beef"], "equipment": ["large pot"], "lengthMinutes": 6 },
          { "number": 2, "step": "Add the onion and cook until soft and translucent, about 4 minutes.", "ingredients": ["onion"], "equipment": [], "lengthMinutes": 4 },
          { "number": 3, "step": "Stir in the chili powder and let it toast for 30 seconds until fragrant.", "ingredients": ["chili powder"], "equipment": [], "lengthMinutes": 1 },
          { "number": 4, "step": "Pour in the beef broth and simmer uncovered until thickened, about 25 minutes.", "ingredients": ["beef broth"], "equipment": [], "lengthMinutes": 25 }
        ]
      }
    ]
  }
]
```

`data/recipes/fixtures/variants.good.json` — one valid crockpot conversion:

```json
[
  {
    "recipeId": 9000001,
    "device": "crockpot",
    "readyInMinutes": 380,
    "steps": [
      { "number": 1, "step": "Brown the ground beef in a skillet over medium-high heat, about 6 minutes — this flavor is worth the one extra pan.", "ingredients": ["ground beef"], "equipment": ["skillet"], "lengthMinutes": 6 },
      { "number": 2, "step": "Move the beef to the slow cooker and add the onion and chili powder.", "ingredients": ["onion", "chili powder"], "equipment": ["slow cooker"], "lengthMinutes": null },
      { "number": 3, "step": "Pour in only half the beef broth — slow cookers barely evaporate, so less liquid keeps it thick.", "ingredients": ["beef broth"], "equipment": [], "lengthMinutes": null },
      { "number": 4, "step": "Cover and cook on low until deep red and thickened, about 6 hours.", "ingredients": [], "equipment": ["slow cooker"], "lengthMinutes": 360 }
    ]
  }
]
```

`data/recipes/fixtures/variants.bad.json` — every error class the mode must catch:

```json
[
  {
    "recipeId": 9999999,
    "device": "crockpot",
    "readyInMinutes": 380,
    "steps": [
      { "number": 1, "step": "This variant points at a recipe id that does not exist anywhere.", "ingredients": [], "equipment": ["slow cooker"], "lengthMinutes": null },
      { "number": 2, "step": "It should be rejected with a dangling recipeId error by the validator.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 3, "step": "Padding step so the step-count rule is not the failure we trigger here.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 4, "step": "Final padding step to reach the minimum of four steps for a variant.", "ingredients": [], "equipment": [], "lengthMinutes": null }
    ]
  },
  {
    "recipeId": 9000001,
    "device": "hologram",
    "readyInMinutes": 30,
    "steps": [
      { "number": 1, "step": "This device id is not one of the ten known cooking devices at all.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 2, "step": "It should be rejected with an unknown-device error by the validator.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 3, "step": "Padding step so the step-count rule is not the failure we trigger here.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 4, "step": "Final padding step to reach the minimum of four steps for a variant.", "ingredients": [], "equipment": [], "lengthMinutes": null }
    ]
  },
  {
    "recipeId": 9000001,
    "device": "oven",
    "readyInMinutes": 60,
    "steps": [
      { "number": 1, "step": "This step references an ingredient the base recipe does not contain.", "ingredients": ["saffron"], "equipment": [], "lengthMinutes": null },
      { "number": 2, "step": "It should be rejected with a matches-no-ingredient error by the validator.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 3, "step": "Padding step so the step-count rule is not the failure we trigger here.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 4, "step": "Final padding step to reach the minimum of four steps for a variant.", "ingredients": [], "equipment": [], "lengthMinutes": null }
    ]
  },
  {
    "recipeId": 9000001,
    "device": "grill",
    "readyInMinutes": 40,
    "steps": [
      { "number": 1, "step": "First copy of a duplicated (recipeId, device) pair for the dupe check.", "ingredients": [], "equipment": ["grill"], "lengthMinutes": null },
      { "number": 2, "step": "Second step padding out this variant to the minimum of four steps.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 3, "step": "Third step padding out this variant to the minimum of four steps.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 4, "step": "Fourth step padding out this variant to the minimum of four steps.", "ingredients": [], "equipment": [], "lengthMinutes": null }
    ]
  },
  {
    "recipeId": 9000001,
    "device": "grill",
    "readyInMinutes": 40,
    "steps": [
      { "number": 1, "step": "Second copy of the duplicated pair — must trigger the duplicate error.", "ingredients": [], "equipment": ["grill"], "lengthMinutes": null },
      { "number": 2, "step": "Second step padding out this variant to the minimum of four steps.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 3, "step": "Third step padding out this variant to the minimum of four steps.", "ingredients": [], "equipment": [], "lengthMinutes": null },
      { "number": 5, "step": "Misnumbered step — should also trigger the sequential-numbering error.", "ingredients": [], "equipment": [], "lengthMinutes": null }
    ]
  }
]
```

- [ ] **Step 2: Run the not-yet-implemented mode to verify it fails**

Run: `node data/recipes/validate.mjs --variants data/recipes/fixtures/variants.good.json --base data/recipes/fixtures/base.good.json`
Expected: errors (the current validator treats `--variants` as a filename and every fixture object fails recipe-shape validation). This is the "failing test".

- [ ] **Step 3: Implement the variants mode**

In `data/recipes/validate.mjs`, insert after the `warn` definition (line 15) and before `const seenIds`:

```js
const DEVICES = new Set([
  'crockpot', 'instantpot', 'airfryer', 'sheetpan', 'microwave',
  'nocook', 'stove', 'oven', 'grill', 'griddle',
]);
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));

/** --variants mode: validate variant files against the base recipe file. */
function validateVariants(files, baseFile) {
  let base;
  try {
    base = JSON.parse(readFileSync(baseFile, 'utf8'));
  } catch (e) {
    err(baseFile, '', `base file does not parse as JSON: ${e.message}`);
    return 0;
  }
  const baseById = new Map(base.map((r) => [r.id, r]));
  const seenPairs = new Set();
  let count = 0;

  for (const file of files) {
    let arr;
    try {
      arr = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      err(file, '', `does not parse as JSON: ${e.message}`);
      continue;
    }
    if (!Array.isArray(arr)) { err(file, '', 'top level must be an array'); continue; }

    for (const v of arr) {
      count++;
      const id = `${v?.recipeId ?? '?'}/${v?.device ?? '?'}`;
      const where = (m) => err(file, id, m);

      if (!Number.isInteger(v.recipeId)) where('recipeId must be an integer');
      const baseRecipe = baseById.get(v.recipeId);
      if (!baseRecipe) { where('recipeId matches no base recipe'); continue; }

      if (!DEVICES.has(v.device)) { where(`unknown device "${v.device}"`); continue; }
      const pair = `${v.recipeId}:${v.device}`;
      if (seenPairs.has(pair)) where('duplicate (recipeId, device) pair');
      else seenPairs.add(pair);

      if (!Number.isInteger(v.readyInMinutes) || v.readyInMinutes < 5 || v.readyInMinutes > 600)
        where('readyInMinutes out of range 5-600');

      if (!Array.isArray(v.steps) || v.steps.length < 4 || v.steps.length > 12) {
        where(`steps must be 4-12 (got ${v.steps?.length})`);
        continue;
      }
      const ingNames = (baseRecipe.ingredients ?? []).map((x) => (x.name ?? '').toLowerCase());
      let stepMinutes = 0;
      for (const [si, s] of v.steps.entries()) {
        if (s.number !== si + 1) where(`step ${si + 1} misnumbered (got ${s.number})`);
        if (typeof s.step !== 'string' || s.step.length < 15) where(`step ${si + 1} text missing/too short`);
        if (!Array.isArray(s.ingredients) || !Array.isArray(s.equipment)) { where(`step ${si + 1} ingredients/equipment must be arrays`); continue; }
        if (!(s.lengthMinutes === null || (Number.isInteger(s.lengthMinutes) && s.lengthMinutes >= 1 && s.lengthMinutes <= 600)))
          where(`step ${si + 1} lengthMinutes must be null or 1-600`);
        else if (typeof s.lengthMinutes === 'number') stepMinutes += s.lengthMinutes;
        for (const n of s.ingredients) {
          const nl = String(n).toLowerCase();
          if (!ingNames.some((g) => g.includes(nl) || nl.includes(g)))
            where(`step ${si + 1} ingredient "${n}" matches no base recipe ingredient`);
        }
      }
      if (stepMinutes > v.readyInMinutes) warn(file, id, `step minutes (${stepMinutes}) exceed readyInMinutes (${v.readyInMinutes})`);
    }
  }
  return count;
}
```

Then replace the argument-handling: change the existing `for (const file of process.argv.slice(2))` loop's surroundings so the script branches on the flag. Replace line 21 (`for (const file of process.argv.slice(2)) {`) region as follows — wrap the EXISTING recipe loop body in a `validateRecipes(files)` function unchanged, then at the bottom:

```js
const args = process.argv.slice(2);
if (args[0] === '--variants') {
  const rest = args.slice(1);
  const baseIdx = rest.indexOf('--base');
  const baseFile = baseIdx >= 0 ? rest[baseIdx + 1] : join(HERE, 'curated.recipes.json');
  const files = baseIdx >= 0 ? [...rest.slice(0, baseIdx), ...rest.slice(baseIdx + 2)] : rest;
  const n = validateVariants(files, baseFile);
  console.log(`\nchecked ${n} variants — ${errors} errors, ${warnings} warnings`);
} else {
  validateRecipes(args);
  console.log(`\nchecked ${total} recipes — ${errors} errors, ${warnings} warnings`);
}
if (errors > 0) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
```

(Keep the recipe-mode output text identical so the existing authoring workflow docs stay true.)

- [ ] **Step 4: Verify the good fixture passes and the bad fixture fails correctly**

Run: `node data/recipes/validate.mjs --variants data/recipes/fixtures/variants.good.json --base data/recipes/fixtures/base.good.json`
Expected: `checked 1 variants — 0 errors`, `PASS`

Run: `node data/recipes/validate.mjs --variants data/recipes/fixtures/variants.bad.json --base data/recipes/fixtures/base.good.json`
Expected: `FAIL` with, at minimum: `recipeId matches no base recipe`, `unknown device "hologram"`, `ingredient "saffron" matches no base recipe ingredient`, `duplicate (recipeId, device) pair`, `step 4 misnumbered (got 5)`.

- [ ] **Step 5: Verify recipe mode still works (regression)**

Run: `node data/recipes/validate.mjs data/recipes/curated.recipes.json`
Expected: `checked 208 recipes`, `PASS` (same as before the change).

Run: `node data/recipes/validate.mjs --variants data/recipes/curated.variants.json`
Expected: `checked 0 variants — 0 errors`, `PASS` (defaults `--base` to the real dataset).

- [ ] **Step 6: Commit**

```bash
git add data/recipes/validate.mjs data/recipes/fixtures/
git commit -m "feat(recipes): validate.mjs --variants mode with fixtures"
```

---

### Task 3: `curatedVariants.ts` lookup module (TDD)

**Files:**
- Create: `apps/mobile/src/data/curated/curatedVariants.ts`
- Test: `apps/mobile/src/data/curated/curatedVariants.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/data/curated/curatedVariants.test.ts`:

```ts
import type { CookingDevice } from '@breadbox/core';

import {
  getDeviceVariants,
  parseVariants,
  pickDefaultDevice,
  type DeviceVariant,
} from './curatedVariants';

const goodStep = {
  number: 1,
  step: 'Cover and cook on low until tender, about 6 hours.',
  ingredients: ['beef broth'],
  equipment: ['slow cooker'],
  lengthMinutes: 360,
};

const goodVariant = {
  recipeId: 9000001,
  device: 'crockpot',
  readyInMinutes: 380,
  steps: [goodStep],
};

describe('parseVariants', () => {
  it('indexes valid entries by recipeId', () => {
    const map = parseVariants([goodVariant, { ...goodVariant, device: 'instantpot' }]);
    expect(map.get(9000001)).toHaveLength(2);
  });

  it('drops malformed entries without throwing', () => {
    const map = parseVariants([
      goodVariant,
      null,
      'nonsense',
      { ...goodVariant, device: 'hologram' },           // unknown device
      { ...goodVariant, recipeId: 'nine million' },      // bad id
      { ...goodVariant, readyInMinutes: null },          // bad time
      { ...goodVariant, steps: [] },                     // no steps
      { ...goodVariant, steps: [{ ...goodStep, step: 42 }] }, // bad step text
    ]);
    expect(map.get(9000001)).toHaveLength(1);
  });

  it('returns an empty map for non-array input', () => {
    expect(parseVariants(undefined).size).toBe(0);
    expect(parseVariants({}).size).toBe(0);
  });
});

describe('getDeviceVariants', () => {
  it('returns [] for unknown ids (bundled dataset lookup)', () => {
    expect(getDeviceVariants(123456)).toEqual([]);
  });
});

describe('pickDefaultDevice', () => {
  const variants = parseVariants([
    goodVariant,
    { ...goodVariant, device: 'airfryer' },
  ]).get(9000001) as DeviceVariant[];

  it("returns the first of tonight's devices that has a variant", () => {
    const tonight: CookingDevice[] = ['grill', 'airfryer', 'crockpot'];
    expect(pickDefaultDevice(tonight, variants)).toBe('airfryer');
  });

  it('returns null when nothing matches or nothing is selected', () => {
    expect(pickDefaultDevice(['grill'], variants)).toBeNull();
    expect(pickDefaultDevice([], variants)).toBeNull();
    expect(pickDefaultDevice(['crockpot'], [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/mobile; npx jest src/data/curated/curatedVariants.test.ts`
Expected: FAIL — `Cannot find module './curatedVariants'`

- [ ] **Step 3: Implement the module**

`apps/mobile/src/data/curated/curatedVariants.ts`:

```ts
/**
 * Device-variant instructions for curated recipes.
 *
 * Sidecar to curated.recipes.json (authoring source of truth:
 * data/recipes/curated.variants.json — validate.mjs --variants cross-checks
 * it against the base file; THIS json is the bundle copy, keep both in sync).
 * A variant is a full alternate instruction set converting a base recipe to
 * another cooking device: its own steps and readyInMinutes, but the SAME
 * ingredient list — so pantry matching, Add-missing, and Cooked-it flows
 * never need to know variants exist.
 *
 * Parsing is defensive: malformed entries are dropped silently so bad data
 * can never crash the Cook tab (the validator catches them before merge —
 * this is belt-and-suspenders for the shipped bundle).
 */
import { COOKING_DEVICES, type CookingDevice } from '@breadbox/core';

import type { RecipeStep } from '../spoonacular/types';
import variantsJson from './curated.variants.json';

export interface DeviceVariant {
  recipeId: number;
  device: CookingDevice;
  readyInMinutes: number;
  steps: RecipeStep[];
}

const DEVICE_IDS = new Set<string>(COOKING_DEVICES.map((d) => d.id));

function isStep(s: unknown): s is RecipeStep {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.number === 'number' &&
    typeof o.step === 'string' &&
    Array.isArray(o.ingredients) &&
    Array.isArray(o.equipment) &&
    (o.lengthMinutes === null || typeof o.lengthMinutes === 'number')
  );
}

function isVariant(v: unknown): v is DeviceVariant {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Number.isInteger(o.recipeId) &&
    typeof o.device === 'string' &&
    DEVICE_IDS.has(o.device) &&
    Number.isInteger(o.readyInMinutes) &&
    Array.isArray(o.steps) &&
    o.steps.length > 0 &&
    o.steps.every(isStep)
  );
}

/** Index raw bundle data by recipeId, dropping anything malformed. */
export function parseVariants(raw: unknown): Map<number, DeviceVariant[]> {
  const map = new Map<number, DeviceVariant[]>();
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (!isVariant(entry)) continue;
    const list = map.get(entry.recipeId);
    if (list) list.push(entry);
    else map.set(entry.recipeId, [entry]);
  }
  return map;
}

const VARIANTS = parseVariants(variantsJson);

/** All device variants for a recipe — [] for Spoonacular ids and unconverted recipes. */
export function getDeviceVariants(recipeId: number): DeviceVariant[] {
  return VARIANTS.get(recipeId) ?? [];
}

/** Device ids a recipe converts to — unioned into ranking's detected set. */
export function getVariantDeviceIds(recipeId: number): CookingDevice[] {
  return getDeviceVariants(recipeId).map((v) => v.device);
}

/**
 * The detail screen's default switcher position: the first of tonight's
 * picked devices that has a variant, in the user's selection order. Null
 * means show the original instructions.
 */
export function pickDefaultDevice(
  tonight: CookingDevice[],
  variants: DeviceVariant[],
): CookingDevice | null {
  for (const d of tonight) {
    if (variants.some((v) => v.device === d)) return d;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/mobile; npx jest src/data/curated/curatedVariants.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data/curated/curatedVariants.ts apps/mobile/src/data/curated/curatedVariants.test.ts
git commit -m "feat(mobile): curatedVariants lookup module"
```

---

### Task 4: Ranking union — variant availability counts as a device match

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx:818-833` (the `deviceByRecipe` memo)

No new unit test: `detectDevices`/`scoreDeviceBoost` are already covered in core, `getVariantDeviceIds` in Task 3; this is a two-line composition verified by typecheck + on-device QA (Task 7).

- [ ] **Step 1: Add the import**

In `RecipesScreen.tsx`, alongside the existing curated imports (search for `curatedSource` or add near other `../../data/` imports):

```ts
import { getVariantDeviceIds } from '../../data/curated/curatedVariants';
```

- [ ] **Step 2: Union variant devices into the detected set**

In the `deviceByRecipe` memo (currently lines 821-833), after `const detected = detectDevices(...)` and before `const boost = ...`:

```ts
      // A curated recipe that CONVERTS to a device counts as a match too —
      // the detail screen will open on that device's variant.
      for (const d of getVariantDeviceIds(r.id)) detected.add(d);
```

Also update the memo's leading comment (lines 818-820) to mention variants:

```ts
  // "Cooking with": tonight's-device boost + badge. Keyword detection over
  // title + per-step equipment, unioned with curated device-variant
  // availability, memoized per fetched page. Empty selection (or "Anything")
  // short-circuits to an empty map — ranking unchanged.
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/mobile; npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(mobile): device variants count as Cook-tab device matches"
```

---

### Task 5: Detail-screen variant switcher

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipeDetailScreen.tsx`

All variant-selection logic that can be pure already lives (tested) in `curatedVariants.ts`; this task is wiring + UI. Verified by typecheck, lint, and the QA script in Task 7. Reference line numbers are pre-change positions.

- [ ] **Step 1: Add imports**

Near the existing imports (`RecipeDetailScreen.tsx:37-54`):

```ts
import { COOKING_DEVICES, type CookingDevice } from '@breadbox/core';
import { getDeviceVariants, pickDefaultDevice } from '../../data/curated/curatedVariants';
import { useTonightDevices } from './useTonightDevices';
```

(`categorizeByName, suggestSubstitutes, titleCaseIngredient` are already imported from `@breadbox/core` — merge into that import statement.)

- [ ] **Step 2: Add variant state + auto-default effect**

Inside the component, after the `useFavorites` line (~141) and before the existing `useState` block:

```ts
  // Device variants: full alternate instruction sets for curated recipes.
  // activeDevice null = the original instructions. Auto-defaults ONCE to the
  // first of tonight's picked devices that has a variant — but never after
  // the user has touched the switcher.
  const variants = useMemo(() => getDeviceVariants(recipe.id), [recipe.id]);
  const { devices: tonightDevices, loaded: tonightLoaded } = useTonightDevices(activeHouseholdId);
  const [activeDevice, setActiveDevice] = useState<CookingDevice | null>(null);
  const deviceTouched = useRef(false);

  useEffect(() => {
    if (!tonightLoaded || deviceTouched.current || variants.length === 0) return;
    const def = pickDefaultDevice(tonightDevices, variants);
    if (def) setActiveDevice(def);
  }, [tonightLoaded, tonightDevices, variants]);

  const activeVariant = useMemo(
    () => variants.find((v) => v.device === activeDevice) ?? null,
    [variants, activeDevice],
  );

  // Chip row entries in COOKING_DEVICES display order (lazy appliances first).
  const variantDevices = useMemo(
    () => COOKING_DEVICES.filter((d) => variants.some((v) => v.device === d.id)),
    [variants],
  );

  function selectDevice(device: CookingDevice | null) {
    deviceTouched.current = true;
    Haptics.selectionAsync().catch(() => {});
    setActiveDevice(device);
    // Checked-off steps belong to the previous instruction set.
    setDoneSteps(new Set());
  }
```

- [ ] **Step 3: Route the active variant through the existing "effective" plumbing**

Replace the `effectiveInstructions` and `effectiveRecipe` memos (currently lines 263-276) with:

```ts
  // A few recipes arrive with empty instructions (see the backfill effect
  // above); once fetched by id, render from that copy instead of the payload.
  // An active device variant takes precedence over both.
  const effectiveInstructions = useMemo(() => {
    if (activeVariant) return [{ name: '', steps: activeVariant.steps }];
    return recipe.instructions.length > 0 ? recipe.instructions : (fetchedSteps ?? []);
  }, [activeVariant, recipe.instructions, fetchedSteps]);
  // Cook Mode reads recipe.instructions directly, so hand it whichever
  // instruction set is on screen (variant > backfill > payload).
  const effectiveRecipe = useMemo(() => {
    if (activeVariant) {
      return {
        ...recipe,
        instructions: [{ name: '', steps: activeVariant.steps }],
        readyInMinutes: activeVariant.readyInMinutes,
      };
    }
    return recipe.instructions.length === 0 && fetchedSteps
      ? { ...recipe, instructions: fetchedSteps }
      : recipe;
  }, [recipe, fetchedSteps, activeVariant]);
```

- [ ] **Step 4: Variant time in the header meta row**

Above the `return` (near `const summary = ...`, line 310), add:

```ts
  const displayMinutes = activeVariant ? activeVariant.readyInMinutes : recipe.readyInMinutes;
```

In the meta row (lines 344-351), replace the two `recipe.readyInMinutes` references:

```tsx
          {(displayMinutes !== null || recipe.servings !== null || showHealth) && (
            <View style={styles.metaRow}>
              {displayMinutes !== null && (
                <View style={styles.metaChip}>
                  <Clock size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>{displayMinutes} min</Text>
                </View>
              )}
```

- [ ] **Step 5: Render the chip row**

Directly under `<Text style={styles.sectionHead}>Steps</Text>` (line 468), insert:

```tsx
          {variantDevices.length > 0 && (
            <View style={styles.deviceRow}>
              <Pressable
                style={[styles.deviceChip, activeDevice === null && styles.deviceChipActive]}
                onPress={() => selectDevice(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeDevice === null }}
                accessibilityLabel="Show the original instructions"
              >
                <Text style={[styles.deviceChipTxt, activeDevice === null && styles.deviceChipTxtActive]}>
                  Original
                </Text>
              </Pressable>
              {variantDevices.map((d) => {
                const active = activeDevice === d.id;
                return (
                  <Pressable
                    key={d.id}
                    style={[styles.deviceChip, active && styles.deviceChipActive]}
                    onPress={() => selectDevice(d.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Show the ${d.label} instructions`}
                  >
                    <Text style={[styles.deviceChipTxt, active && styles.deviceChipTxtActive]}>
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
```

- [ ] **Step 6: Add the chip styles**

In the `StyleSheet.create` block, next to the existing `chip*` styles:

```ts
  deviceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space(2),
    marginBottom: tokens.space(3),
  },
  deviceChip: {
    paddingHorizontal: tokens.space(3),
    paddingVertical: tokens.space(1.5),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  deviceChipActive: {
    borderColor: tokens.color.accent,
    backgroundColor: tokens.color.accentSoft,
  },
  deviceChipTxt: {
    fontSize: 13,
    fontFamily: tokens.font.medium,
    color: tokens.color.inkMuted,
  },
  deviceChipTxtActive: {
    color: tokens.color.accent,
  },
```

(Token names: check `apps/mobile/src/theme/tokens.ts` for the exact `accentSoft`/`surface`/`border`/`font.medium` names before writing — if a name differs, copy whatever the existing active/inactive chip styles in this file or `RecipesScreen.tsx` use. Do not invent new token values.)

- [ ] **Step 7: Guard the lazy step backfill**

The backfill effect (lines 164-176) fetches steps only when `recipe.instructions.length === 0` — curated recipes always have instructions, so no interaction with variants. No change needed; just confirm the condition still reads `recipe.instructions.length` (NOT `effectiveInstructions`).

- [ ] **Step 8: Typecheck, lint, and full mobile test suite**

Run: `cd apps/mobile; npx tsc --noEmit` — Expected: no errors.
Run: `npm run lint` (repo root) — Expected: no errors.
Run: `cd apps/mobile; npm test` — Expected: PASS (existing suites + curatedVariants).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipeDetailScreen.tsx
git commit -m "feat(mobile): device-variant switcher on recipe detail"
```

---

### Task 6: Seed variants — prove the pipeline end-to-end

Before the big authoring sweep, land ~3 hand-authored variants so the feature is demonstrable and QA-able.

**Files:**
- Modify: `data/recipes/curated.variants.json`
- Modify: `apps/mobile/src/data/curated/curated.variants.json`

- [ ] **Step 1: Pick 3 seed recipes**

Run: `node -e "const r=require('./data/recipes/curated.recipes.json'); for (const x of r) if (/chili|stew|pulled|braise|curry/i.test(x.title)) console.log(x.id, x.title)"`
Pick three stovetop/oven mains from the output (stew-like dishes convert best to crockpot/instantpot).

- [ ] **Step 2: Author one crockpot + one instantpot variant for each**

Write them per `data/recipes/SPEC-VARIANTS.md` (Pantry Party voice, shared base ingredients, realistic times — crockpot ~360-480 min, instantpot usually FASTER than the base). Append to BOTH copies of `curated.variants.json` (keep the array sorted by `recipeId`, then device).

- [ ] **Step 3: Validate**

Run: `node data/recipes/validate.mjs --variants data/recipes/curated.variants.json`
Expected: `checked 6 variants — 0 errors`, `PASS`

Run: `node -e "const a=require('./data/recipes/curated.variants.json'), b=require('./apps/mobile/src/data/curated/curated.variants.json'); console.log(JSON.stringify(a)===JSON.stringify(b) ? 'IN SYNC' : 'DRIFT')"`
Expected: `IN SYNC`

- [ ] **Step 4: Commit**

```bash
git add data/recipes/curated.variants.json apps/mobile/src/data/curated/curated.variants.json
git commit -m "feat(recipes): seed device variants for three curated mains"
```

---

### Task 7: On-device QA

**Files:** none (manual verification; fixes go in follow-up commits)

- [ ] **Step 1: Launch the app** (Expo dev build per repo norms: `cd apps/mobile; npm start`, open on the dev device/simulator)

- [ ] **Step 2: Walk the QA script**

1. Cook tab → answer tonight's prompt with **Crockpot**.
2. A seed recipe should rank up with a "Crockpot pick" badge (it has a variant, even though its title/equipment never say crockpot).
3. Open it → the switcher shows **Original · Crockpot · Instant Pot**, with **Crockpot** pre-selected; header time shows the variant's minutes (e.g. 380, not 45).
4. Check off two steps → switch to **Original** → steps change, time reverts, check-offs cleared.
5. Start cooking (Cook Mode) with Crockpot active → cook-along shows the crockpot steps and "slow cooker" in the equipment list.
6. Open any Spoonacular recipe → no switcher, unchanged behavior.
7. Kill and relaunch the app → open the seed recipe again → still defaults to Crockpot (tonight's answer persisted).

- [ ] **Step 3: Fix anything that fails, commit fixes, re-run the script until clean**

---

### Task 8: Coverage matrix for the full sweep

**Files:**
- Create: `data/recipes/gen-coverage.mjs`
- Create: `data/recipes/variants-coverage.json` (generated)

- [ ] **Step 1: Write the generator**

`data/recipes/gen-coverage.mjs` — pre-fills `native` via the same keyword detection the app uses; everything else starts as `"todo"` for the authoring pass to resolve into `convert` or `skip`:

```js
#!/usr/bin/env node
/**
 * Generates variants-coverage.json: per recipe x device, "native" | "todo".
 * The authoring pass resolves each "todo" to "convert" (author a variant) or
 * "skip" (culinary nonsense). KEEP THE KEYWORD TABLE IN SYNC with
 * packages/core/src/cookingDevice.ts (COOKING_DEVICES + STOVE_EXCEPTIONS).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const KEYWORDS = {
  crockpot: ['slow cooker', 'slow-cooker', 'crock pot', 'crockpot', 'slow-cooked'],
  instantpot: ['instant pot', 'instantpot', 'pressure cooker', 'pressure cook', 'multicooker'],
  airfryer: ['air fryer', 'air-fryer', 'air fried', 'air-fried'],
  sheetpan: ['sheet pan', 'sheet-pan', 'sheetpan', 'baking sheet'],
  microwave: ['microwave', 'microwaved'],
  nocook: ['no-cook', 'no cook', 'no-bake', 'no bake'],
  stove: ['skillet', 'saucepan', 'sauté pan', 'saute pan', 'frying pan', 'stovetop', 'stove', 'wok', 'pan-fried', 'pan-seared'],
  oven: ['oven', 'baking dish', 'roasting pan', 'casserole dish', 'baked', 'roasted'],
  grill: ['grill', 'grilled', 'barbecue', 'bbq'],
  griddle: ['griddle', 'flat top', 'flat-top', 'plancha'],
};
const STOVE_EXCEPTIONS = ['dutch oven', 'grill pan'];

const recipes = JSON.parse(readFileSync(join(HERE, 'curated.recipes.json'), 'utf8'));
const out = recipes.map((r) => {
  let hay = [r.title, ...r.instructions[0].steps.flatMap((s) => s.equipment)].join(' | ').toLowerCase();
  const native = new Set();
  for (const p of STOVE_EXCEPTIONS) {
    if (hay.includes(p)) { native.add('stove'); hay = hay.split(p).join(' '); }
  }
  for (const [device, kws] of Object.entries(KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) native.add(device);
  }
  const devices = {};
  for (const device of Object.keys(KEYWORDS)) {
    devices[device] = native.has(device) ? 'native' : 'todo';
  }
  return { recipeId: r.id, title: r.title, mealType: r.mealType, devices };
});
writeFileSync(join(HERE, 'variants-coverage.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote coverage for ${out.length} recipes`);
```

- [ ] **Step 2: Generate and sanity-check**

Run: `node data/recipes/gen-coverage.mjs`
Expected: `wrote coverage for 208 recipes`

Run: `node -e "const c=require('./data/recipes/variants-coverage.json'); const n=c.filter(r=>Object.values(r.devices).includes('native')).length; console.log(n + ' recipes have at least one native device')"`
Expected: a large majority of the 208 (spot-check 2-3 rows against the actual recipes).

- [ ] **Step 3: Resolve the todos (judgment pass)**

Edit `variants-coverage.json` (by hand or via a review agent) turning every `"todo"` into `"convert"` or `"skip"`. Ground rules from the spec: conversions must be genuinely good (no crockpot salads, no grilled puddings); `nocook` almost always `skip` unless the dish is genuinely assemble-only; prioritize crockpot/instantpot/airfryer conversions for mains. When done:

Run: `node -e "const c=require('./data/recipes/variants-coverage.json'); const t=c.flatMap(r=>Object.values(r.devices)); console.log('convert:', t.filter(x=>x==='convert').length, 'skip:', t.filter(x=>x==='skip').length, 'todo:', t.filter(x=>x==='todo').length)"`
Expected: `todo: 0`; the `convert` count (est. 350-500) is the sweep's workload.

- [ ] **Step 4: Commit**

```bash
git add data/recipes/gen-coverage.mjs data/recipes/variants-coverage.json
git commit -m "feat(recipes): device-variant coverage matrix"
```

---

### Task 9: Authoring sweep in parallel batches

**Files:**
- Create: `data/recipes/variants-batches/batch-NN.json` (one per batch)
- Create: `data/recipes/merge-variants.mjs`
- Modify: `data/recipes/curated.variants.json` + bundle copy (merge output)

- [ ] **Step 1: Write the merge script**

`data/recipes/merge-variants.mjs`:

```js
#!/usr/bin/env node
/**
 * Merges variants-batches/*.json + the existing curated.variants.json into a
 * single sorted curated.variants.json AND its mobile bundle copy.
 * Later files never silently overwrite: duplicate (recipeId, device) pairs abort.
 * Usage: node merge-variants.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = join(HERE, 'curated.variants.json');
const BUNDLE = join(HERE, '..', '..', 'apps', 'mobile', 'src', 'data', 'curated', 'curated.variants.json');
const BATCH_DIR = join(HERE, 'variants-batches');

const all = [...JSON.parse(readFileSync(MAIN, 'utf8'))];
for (const f of readdirSync(BATCH_DIR).filter((f) => f.endsWith('.json')).sort()) {
  all.push(...JSON.parse(readFileSync(join(BATCH_DIR, f), 'utf8')));
}
const seen = new Set();
for (const v of all) {
  const key = `${v.recipeId}:${v.device}`;
  if (seen.has(key)) { console.error(`DUPLICATE pair ${key} — aborting, nothing written`); process.exit(1); }
  seen.add(key);
}
all.sort((a, b) => a.recipeId - b.recipeId || a.device.localeCompare(b.device));
const json = JSON.stringify(all, null, 2) + '\n';
writeFileSync(MAIN, json);
writeFileSync(BUNDLE, json);
console.log(`merged ${all.length} variants -> curated.variants.json (+ bundle copy)`);
```

- [ ] **Step 2: Slice the coverage matrix into batch assignments**

Run: `node -e "const c=require('./data/recipes/variants-coverage.json'); const jobs=[]; for (const r of c) for (const [d,s] of Object.entries(r.devices)) if (s==='convert') jobs.push(r.recipeId+' '+r.title+' -> '+d); console.log(jobs.length+' variants to author'); require('fs').writeFileSync('data/recipes/variants-batches/ASSIGNMENTS.txt', jobs.join('\n')+'\n')"`
(Create `data/recipes/variants-batches/` first.) Split ASSIGNMENTS.txt into chunks of ~25.

- [ ] **Step 3: Dispatch authoring agents (one per batch, parallelizable)**

Prompt template per agent — fill in the batch file name and its assignment lines:

> Read `data/recipes/SPEC.md`, then `data/recipes/SPEC-VARIANTS.md`. Author device variants for these (recipeId, title → device) assignments: [PASTE CHUNK]. For each, read the base recipe from `data/recipes/curated.recipes.json` (match by id) and write a genuinely good conversion — same ingredient list, device-appropriate steps and total time, Pantry Party Kitchen voice. Write your JSON array to `data/recipes/variants-batches/batch-NN.json`, then run `node data/recipes/validate.mjs --variants data/recipes/variants-batches/batch-NN.json` and fix every ERROR until PASS. If an assignment turns out not to convert well, drop it and report why. Report: variant count, dropped pairings with reasons, PASS line.

Each batch must end with its own validator PASS. Update `variants-coverage.json` (`convert` → `skip`) for any pairings agents dropped, with the reported reasons reviewed.

- [ ] **Step 4: Merge, validate the merged whole, verify sync**

Run: `node data/recipes/merge-variants.mjs`
Expected: `merged N variants -> curated.variants.json (+ bundle copy)`

Run: `node data/recipes/validate.mjs --variants data/recipes/curated.variants.json`
Expected: `checked N variants — 0 errors`, `PASS`

Run: `node -e "const a=require('./data/recipes/curated.variants.json'), b=require('./apps/mobile/src/data/curated/curated.variants.json'); console.log(JSON.stringify(a)===JSON.stringify(b) ? 'IN SYNC' : 'DRIFT')"`
Expected: `IN SYNC`

- [ ] **Step 5: Full verification pass**

Run: `cd apps/mobile; npx tsc --noEmit` — Expected: no errors.
Run: `npm run lint` — Expected: no errors.
Run: `cd apps/mobile; npm test` — Expected: PASS.

- [ ] **Step 6: Commit (batches can also land as multiple wave commits/PRs — the feature works at any coverage level)**

```bash
git add data/recipes/variants-batches/ data/recipes/merge-variants.mjs data/recipes/curated.variants.json data/recipes/variants-coverage.json apps/mobile/src/data/curated/curated.variants.json
git commit -m "feat(recipes): device-variant authoring sweep"
```

- [ ] **Step 7: Spot-check on device** — re-run the Task 7 QA script against 3 newly authored variants (one crockpot, one instantpot, one airfryer).
