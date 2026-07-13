# Brand Tiles for Staple Pickers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text-chip staple pickers (onboarding + Quick Add) with Direction-B illustrated tiles: solid earthy ground panel, cream silhouette glyph, label below — one unique glyph per staple (31 new glyphs).

**Architecture:** The `BrandIcon` glyph record splits into `brandGlyphs.core.ts` (existing 18, moved verbatim) + `brandGlyphs.pantry.ts` (31 new). `BrandIcon.tsx` merges them; its public API is unchanged. A new stateless `BrandTile` renders one tappable tile; `stapleArt.ts` maps staple names → glyphs; `QuickAddStaples` renders tile grids instead of chip rows. Onboarding and Quick Add inherit the change through `QuickAddStaples`.

**Tech Stack:** React Native (Expo), react-native-svg, jest + @testing-library/react-native (`jest-expo` preset). Worktree: `C:\Users\JCS\Pantry-Party-tiles`, branch `feat/brand-tile-staples`.

**Verification commands (run from the worktree):**
- Typecheck: `cd apps/mobile && npx tsc --noEmit` (root typecheck is broken — never use it)
- Lint: `npm run lint` (errors fail CI; ~10 pre-existing warnings are fine)
- Mobile tests: `cd apps/mobile && npx jest`
- Core tests (untouched by this plan, run once at the end): `npm test --workspace @breadbox/core`

**Glyph construction rule (applies to every new glyph):** viewBox 48×48, drawn inside x∈[12,36] roughly; solid silhouette filled with `p.body`; 2–3 interior cut-marks stroked/filled with `p.cut`; `p.leaf` ONLY where botanically natural (olive sprig, tomato-can leaf, tea tag). Marks OUTSIDE the silhouette (steam, handles, saucers, strings) use `p.body` — `p.cut` is the ground color and would vanish against the panel. Group wrapper (provided by `BrandIcon`) sets `strokeWidth 3`, round caps/joins.

---

### Task 1: Split the existing glyphs into `brandGlyphs.core.ts`

Pure refactor — no visual or API change.

**Files:**
- Create: `apps/mobile/src/components/brandGlyphs.core.ts`
- Modify: `apps/mobile/src/components/BrandIcon.tsx`

- [ ] **Step 1: Create `apps/mobile/src/components/brandGlyphs.core.ts`**

Move (verbatim) the 18 glyph functions from `BrandIcon.tsx`'s `GLYPHS` record into this file, with the `Paint` interface now exported here. File skeleton (glyph bodies are the exact JSX currently in `BrandIcon.tsx` — cut/paste, do not redraw):

```tsx
/**
 * brandGlyphs.core — the original 18 loaf-mark food glyphs, moved verbatim
 * from BrandIcon.tsx so the record can grow (pantry staples, appliances)
 * without one file ballooning. See BrandIcon.tsx for the paint rules.
 */
import { Circle, Ellipse, Path } from 'react-native-svg';

export interface Paint {
  body: string;
  cut: string;
  leaf: string;
}

export type CoreFoodName =
  | 'bread' | 'apple' | 'pear' | 'tomato' | 'carrot' | 'mushroom' | 'croissant'
  | 'fish' | 'egg' | 'herb' | 'grapes' | 'cheese' | 'jar' | 'bottle' | 'cherry'
  | 'lemon' | 'pepper' | 'spoon';

export const CORE_GLYPHS: Record<CoreFoodName, (c: Paint) => React.ReactNode> = {
  // ← paste the 18 existing glyph entries from BrandIcon.tsx unchanged
  bread: ({ body, cut, leaf }) => ( /* existing JSX */ ),
  // … apple, pear, tomato, carrot, mushroom, croissant, fish, egg, herb,
  //   grapes, cheese, jar, bottle, cherry, lemon, pepper, spoon
};
```

- [ ] **Step 2: Rewrite `BrandIcon.tsx` to import the record**

Replace the inline `Paint` interface and `GLYPHS` record with:

```tsx
import Svg, { G } from 'react-native-svg';

import { BRAND_CREAM, BRAND_LEAF, toneHex, type BrandTone } from '../theme/brandPalette';
import { CORE_GLYPHS, type CoreFoodName, type Paint } from './brandGlyphs.core';

export type BrandFoodName = CoreFoodName;

const GLYPHS = CORE_GLYPHS;
```

Keep `FOOD_TONE`, `BrandIconProps`, `BrandIcon`, and `BRAND_FOODS` exactly as they are (their types already reference `BrandFoodName`). Remove the now-unused `Circle, Ellipse, Path` imports from `BrandIcon.tsx` (they moved to the core file).

- [ ] **Step 3: Typecheck and run the mobile suite**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest`
Expected: tsc silent; jest 14/14 pass (nothing imports the moved internals directly).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.core.ts apps/mobile/src/components/BrandIcon.tsx
git commit -m "refactor(brand): move the 18 loaf-mark glyphs into brandGlyphs.core.ts"
```

---

### Task 2: Structural completeness test for the glyph family

**Files:**
- Create: `apps/mobile/src/components/brandGlyphs.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { BRAND_FOODS, FOOD_TONE } from './BrandIcon';
import { CORE_GLYPHS } from './brandGlyphs.core';

// FOOD_TONE and the glyph record must cover exactly the same names, and the
// showcase order must not reference a missing glyph. Guards every future
// glyph addition (pantry staples, appliances) structurally.
describe('brand glyph family', () => {
  it('every toned food has a glyph and vice versa', () => {
    const toneKeys = Object.keys(FOOD_TONE).sort();
    const glyphKeys = Object.keys(CORE_GLYPHS).sort();
    expect(toneKeys).toEqual(glyphKeys);
  });

  it('BRAND_FOODS only lists real glyphs', () => {
    for (const name of BRAND_FOODS) {
      expect(FOOD_TONE[name]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/mobile && npx jest src/components/brandGlyphs.test.ts`
Expected: PASS (2 tests) — 18 keys on both sides.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.test.ts
git commit -m "test(brand): glyph/tone completeness guard"
```

> **Note for Tasks 3–6:** when `brandGlyphs.pantry.ts` exists, update the first test's `glyphKeys` line to
> `const glyphKeys = Object.keys({ ...CORE_GLYPHS, ...PANTRY_GLYPHS }).sort();`
> (add the import). Task 3 Step 3 shows this edit; it happens once.

---

### Task 3: Pantry glyphs — Baking group (7)

**Files:**
- Create: `apps/mobile/src/components/brandGlyphs.pantry.ts`
- Modify: `apps/mobile/src/components/BrandIcon.tsx`
- Modify: `apps/mobile/src/components/brandGlyphs.test.ts`

- [ ] **Step 1: Create `brandGlyphs.pantry.ts` with the Baking glyphs**

```tsx
/**
 * brandGlyphs.pantry — staple-picker glyphs (one per staple, no sharing).
 * Same construction rule as the core family: solid `body` silhouette, 2–3
 * `cut` marks, `leaf` only where botanically natural. Marks OUTSIDE the
 * silhouette (steam, handles, strings) use `body` — `cut` is the panel color.
 */
import { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import type { Paint } from './brandGlyphs.core';

export type PantryFoodName =
  | 'floursack' | 'sugarbowl' | 'sugarbag' | 'sodabox' | 'powdertin' | 'saltshaker' | 'yeastpacket';

export const PANTRY_GLYPHS: Record<PantryFoodName, (c: Paint) => React.ReactNode> = {
  // Rolled-top flour sack, stitch marks.
  floursack: ({ body, cut }) => (
    <>
      <Path d="M14 40 L14 24 Q14 18 19 17 L29 17 Q34 18 34 24 L34 40 Z" fill={body} />
      <Path d="M18 17 L30 17 L28 11 L20 11 Z" fill={body} />
      <Path d="M20 28 h8" fill="none" stroke={cut} />
      <Path d="M20 33 h8" fill="none" stroke={cut} />
    </>
  ),
  // Lidded sugar bowl, knob, cube alongside.
  sugarbowl: ({ body, cut }) => (
    <>
      <Path d="M13 27 Q13 38 24 38 Q35 38 35 27 Z" fill={body} />
      <Path d="M14 27 Q14 20 24 20 Q34 20 34 27 Z" fill={body} />
      <Circle cx={24} cy={17} r={2.5} fill={body} />
      <Path d="M16 27 h16" fill="none" stroke={cut} />
      <Rect x={35} y={33} width={5} height={5} rx={1} fill={body} />
    </>
  ),
  // Soft brown-sugar bag with a folded top and grain specks.
  sugarbag: ({ body, cut }) => (
    <>
      <Path d="M16 40 Q13 30 17 21 L21 15 H27 L31 21 Q35 30 32 40 Z" fill={body} />
      <Path d="M21 15 L24 20 L27 15" fill="none" stroke={cut} />
      <Circle cx={21} cy={30} r={1.3} fill={cut} />
      <Circle cx={26} cy={33} r={1.3} fill={cut} />
      <Circle cx={23} cy={36} r={1.1} fill={cut} />
    </>
  ),
  // Upright baking-soda box with open flaps and a band.
  sodabox: ({ body, cut }) => (
    <>
      <Rect x={16} y={16} width={16} height={24} rx={2} fill={body} />
      <Path d="M16 16 L20 10 H28 L32 16 Z" fill={body} />
      <Path d="M16 26 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={33} r={2} fill={cut} />
    </>
  ),
  // Squat round baking-powder tin with a lid lip.
  powdertin: ({ body, cut }) => (
    <>
      <Rect x={15} y={20} width={18} height={18} rx={3} fill={body} />
      <Rect x={13} y={15} width={22} height={7} rx={3} fill={body} />
      <Path d="M19 30 h10" fill="none" stroke={cut} />
    </>
  ),
  // Domed salt shaker, three pour holes, waist line.
  saltshaker: ({ body, cut }) => (
    <>
      <Path d="M17 22 Q17 12 24 12 Q31 12 31 22 L31 36 Q31 40 27 40 H21 Q17 40 17 36 Z" fill={body} />
      <Circle cx={21} cy={17} r={1.2} fill={cut} />
      <Circle cx={27} cy={17} r={1.2} fill={cut} />
      <Circle cx={24} cy={14.5} r={1.2} fill={cut} />
      <Path d="M17 24 h14" fill="none" stroke={cut} />
    </>
  ),
  // Yeast sachet with a serration line and grain dots.
  yeastpacket: ({ body, cut }) => (
    <>
      <Rect x={15} y={15} width={18} height={24} rx={2} fill={body} />
      <Path d="M15 20 h18" fill="none" stroke={cut} />
      <Circle cx={20} cy={29} r={1.2} fill={cut} />
      <Circle cx={25} cy={32} r={1.2} fill={cut} />
      <Circle cx={28} cy={27} r={1.2} fill={cut} />
    </>
  ),
};

/** Natural ground per pantry glyph — merged into BrandIcon's FOOD_TONE. */
export const PANTRY_TONE = {
  floursack: 'ochre', sugarbowl: 'blue', sugarbag: 'cocoa', sodabox: 'spruce',
  powdertin: 'terracotta', saltshaker: 'blue', yeastpacket: 'ochre',
} as const;
```

- [ ] **Step 2: Merge into `BrandIcon.tsx`**

```tsx
import { CORE_GLYPHS, type CoreFoodName, type Paint } from './brandGlyphs.core';
import { PANTRY_GLYPHS, PANTRY_TONE, type PantryFoodName } from './brandGlyphs.pantry';

export type BrandFoodName = CoreFoodName | PantryFoodName;

const GLYPHS = { ...CORE_GLYPHS, ...PANTRY_GLYPHS };
```

And extend the tone record (keep the existing 18 entries, spread the pantry tones):

```tsx
export const FOOD_TONE: Record<BrandFoodName, BrandTone> = {
  // …existing 18 entries unchanged…
  ...PANTRY_TONE,
};
```

`BRAND_FOODS` stays as-is (it is a curated showcase order, not an index).

- [ ] **Step 3: Update the completeness test to merge both records**

In `brandGlyphs.test.ts`:

```ts
import { PANTRY_GLYPHS } from './brandGlyphs.pantry';
// …
const glyphKeys = Object.keys({ ...CORE_GLYPHS, ...PANTRY_GLYPHS }).sort();
```

- [ ] **Step 4: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/components/brandGlyphs.test.ts`
Expected: tsc silent; 2 tests pass (25 keys both sides).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.ts apps/mobile/src/components/BrandIcon.tsx apps/mobile/src/components/brandGlyphs.test.ts
git commit -m "feat(brand): baking-group staple glyphs (7)"
```

---

### Task 4: Pantry glyphs — Oils & sauces group (9)

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.pantry.ts`

- [ ] **Step 1: Extend `PantryFoodName`, `PANTRY_GLYPHS`, `PANTRY_TONE`**

Add to the union: `| 'oliveoilbottle' | 'oiljug' | 'soybottle' | 'ketchupbottle' | 'mustardbottle' | 'mayojar' | 'hotsaucebottle' | 'vinegarflask' | 'honeypot'`

Add to `PANTRY_GLYPHS`:

```tsx
  // Slim olive-oil cruet with a pour spout and an olive sprig (leaf natural).
  oliveoilbottle: ({ body, cut, leaf }) => (
    <>
      <Path d="M22 12 h4 v6 l4 6 v13 q0 3 -3 3 h-6 q-3 0 -3 -3 V24 l4 -6 Z" fill={body} />
      <Path d="M22 12 l-3 -3" fill="none" stroke={body} />
      <Path d="M27 13 C30 10 34 11 34 11 C34 14 31 16 28 15 Z" fill={leaf} />
      <Path d="M20 30 h8" fill="none" stroke={cut} />
    </>
  ),
  // Handled vegetable-oil jug with a cap.
  oiljug: ({ body, cut }) => (
    <>
      <Path d="M16 22 l4 -5 v-4 h8 v4 l2 3 v17 q0 3 -3 3 H19 q-3 0 -3 -3 Z" fill={body} />
      <Path d="M31 24 q5 2 3 8" fill="none" stroke={body} />
      <Rect x={20} y={10} width={8} height={3} rx={1} fill={body} />
      <Path d="M20 30 h8" fill="none" stroke={cut} />
    </>
  ),
  // Narrow-waist soy bottle with a collar line.
  soybottle: ({ body, cut }) => (
    <>
      <Path d="M21 12 h6 v7 q5 2 5 8 v10 q0 3 -3 3 h-10 q-3 0 -3 -3 V27 q0 -6 5 -8 Z" fill={body} />
      <Path d="M21 19 h6" fill="none" stroke={cut} />
      <Path d="M19 31 h10" fill="none" stroke={cut} />
    </>
  ),
  // Ketchup squeeze bottle with a cone cap.
  ketchupbottle: ({ body, cut }) => (
    <>
      <Path d="M20 20 q-3 9 0 17 q0 3 3 3 h2 q3 0 3 -3 q3 -8 0 -17 Z" fill={body} />
      <Rect x={21.5} y={14} width={5} height={7} rx={1} fill={body} />
      <Path d="M21 14 L24 9 L27 14 Z" fill={body} />
      <Path d="M21 27 h6" fill="none" stroke={cut} />
    </>
  ),
  // Mustard bottle — squared shoulders, pointed nozzle.
  mustardbottle: ({ body, cut }) => (
    <>
      <Rect x={19} y={18} width={10} height={22} rx={3} fill={body} />
      <Path d="M20 18 l2 -4 h4 l2 4 Z" fill={body} />
      <Path d="M24 8 l1.5 6 h-3 Z" fill={body} />
      <Circle cx={24} cy={28} r={3} fill="none" stroke={cut} />
    </>
  ),
  // Wide mayo jar with a tall lid band and oval label.
  mayojar: ({ body, cut }) => (
    <>
      <Rect x={16} y={20} width={16} height={18} rx={4} fill={body} />
      <Rect x={15} y={13} width={18} height={7} rx={2} fill={body} />
      <Ellipse cx={24} cy={29} rx={4.5} ry={3.5} fill="none" stroke={cut} />
    </>
  ),
  // Small hot-sauce bottle with cap rings.
  hotsaucebottle: ({ body, cut }) => (
    <>
      <Rect x={19} y={22} width={10} height={18} rx={3} fill={body} />
      <Rect x={21.5} y={16} width={5} height={7} fill={body} />
      <Rect x={20.5} y={12} width={7} height={5} rx={1} fill={body} />
      <Path d="M21.5 14.5 h5" fill="none" stroke={cut} />
      <Path d="M22 29 q2 4 4 0" fill="none" stroke={cut} />
    </>
  ),
  // Corked vinegar flask with sloped shoulders.
  vinegarflask: ({ body, cut }) => (
    <>
      <Path d="M21 20 L15 33 q-2 5 3 5 h12 q5 0 3 -5 L27 20 Z" fill={body} />
      <Rect x={21} y={13} width={6} height={8} fill={body} />
      <Rect x={21.5} y={9} width={5} height={4} rx={1} fill={body} />
      <Path d="M19 28 h10" fill="none" stroke={cut} />
    </>
  ),
  // Honey pot with a rim band, drip mark, and dipper handle.
  honeypot: ({ body, cut }) => (
    <>
      <Path d="M15 25 q0 -7 9 -7 q9 0 9 7 q0 13 -9 13 q-9 0 -9 -13 Z" fill={body} />
      <Rect x={17} y={15} width={14} height={4} rx={2} fill={body} />
      <Path d="M30 13 l6 -5" fill="none" stroke={body} />
      <Path d="M20 27 q1 4 3 3" fill="none" stroke={cut} />
    </>
  ),
```

Add to `PANTRY_TONE`:

```ts
  oliveoilbottle: 'olive', oiljug: 'ochre', soybottle: 'cocoa', ketchupbottle: 'brick',
  mustardbottle: 'ochre', mayojar: 'blue', hotsaucebottle: 'brick', vinegarflask: 'plum',
  honeypot: 'ochre',
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/components/brandGlyphs.test.ts`
Expected: PASS (34 keys both sides).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.ts
git commit -m "feat(brand): oils-and-sauces staple glyphs (9)"
```

---

### Task 5: Pantry glyphs — Grains & canned group (7)

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.pantry.ts`

- [ ] **Step 1: Extend the union, record, and tones**

Union additions: `| 'ricebowl' | 'spaghetti' | 'oatcanister' | 'tomatocan' | 'beancan' | 'stockcarton' | 'peppergrinder'`

```tsx
  // Rice bowl with a mound and grain specks.
  ricebowl: ({ body, cut }) => (
    <>
      <Path d="M16 27 Q16 19 24 19 Q32 19 32 27 Z" fill={body} />
      <Path d="M11 27 Q24 40 37 27 Z" fill={body} />
      <Circle cx={21} cy={23} r={1.2} fill={cut} />
      <Circle cx={26} cy={24} r={1.2} fill={cut} />
      <Circle cx={24} cy={21.5} r={1.1} fill={cut} />
    </>
  ),
  // Standing spaghetti bundle with a tie band and strand lines.
  spaghetti: ({ body, cut }) => (
    <>
      <Rect x={17} y={10} width={14} height={30} rx={2} fill={body} />
      <Rect x={15} y={22} width={18} height={5} rx={2} fill={body} />
      <Path d="M21 13 v7 M27 13 v7" fill="none" stroke={cut} />
      <Path d="M21 29 v7 M27 29 v7" fill="none" stroke={cut} />
    </>
  ),
  // Cylindrical oat canister with lid and label bands.
  oatcanister: ({ body, cut }) => (
    <>
      <Rect x={16} y={12} width={16} height={28} rx={4} fill={body} />
      <Path d="M16 18 h16" fill="none" stroke={cut} />
      <Path d="M16 33 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={26} r={3.5} fill="none" stroke={cut} />
    </>
  ),
  // Tomato can — label circle + tiny leaf (natural: it IS a tomato).
  tomatocan: ({ body, cut, leaf }) => (
    <>
      <Rect x={16} y={14} width={16} height={24} rx={2} fill={body} />
      <Path d="M16 17.5 h16" fill="none" stroke={cut} />
      <Circle cx={24} cy={28} r={4} fill={cut} />
      <Path d="M24 24 C26 21 29 22 29 22 C29 24 27 25 25 24.5 Z" fill={leaf} />
    </>
  ),
  // Bean can — tilted open lid + two bean dots.
  beancan: ({ body, cut }) => (
    <>
      <Rect x={16} y={16} width={16} height={22} rx={2} fill={body} />
      <Path d="M16 15 L32 11" fill="none" stroke={body} />
      <Ellipse cx={21} cy={27} rx={2.6} ry={1.9} fill={cut} />
      <Ellipse cx={27} cy={30} rx={2.6} ry={1.9} fill={cut} />
    </>
  ),
  // Gable-top stock carton with a steam curl on the label.
  stockcarton: ({ body, cut }) => (
    <>
      <Path d="M16 20 h16 v18 q0 2 -2 2 H18 q-2 0 -2 -2 Z" fill={body} />
      <Path d="M16 20 L20 12 h8 l4 8 Z" fill={body} />
      <Path d="M22 12 v4" fill="none" stroke={cut} />
      <Path d="M22 30 q2 -3 0 -5 M26 30 q2 -3 0 -5" fill="none" stroke={cut} />
    </>
  ),
  // Waisted pepper grinder with a crank arm.
  peppergrinder: ({ body, cut }) => (
    <>
      <Path d="M18 40 q-2 -11 3 -17 q-3 -3 -3 -7 h12 q0 4 -3 7 q5 6 3 17 Z" fill={body} />
      <Circle cx={24} cy={12} r={2.5} fill={body} />
      <Path d="M26 12 h6" fill="none" stroke={body} />
      <Path d="M20 32 h8" fill="none" stroke={cut} />
    </>
  ),
```

Tones:

```ts
  ricebowl: 'terracotta', spaghetti: 'ochre', oatcanister: 'cocoa', tomatocan: 'brick',
  beancan: 'cocoa', stockcarton: 'spruce', peppergrinder: 'cocoa',
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/components/brandGlyphs.test.ts`
Expected: PASS (41 keys both sides).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.ts
git commit -m "feat(brand): grains-and-canned staple glyphs (7)"
```

---

### Task 6: Pantry glyphs — Drinks & fridge group (8)

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.pantry.ts`

- [ ] **Step 1: Extend the union, record, and tones**

Union additions: `| 'waterglass' | 'fizzybottle' | 'juicecarton' | 'coffeemug' | 'teacup' | 'sodacan' | 'milkjug' | 'butterdish'`

```tsx
  // Tumbler with a wave line.
  waterglass: ({ body, cut }) => (
    <>
      <Path d="M17 13 h14 l-2 25 q0 2 -2 2 h-6 q-2 0 -2 -2 Z" fill={body} />
      <Path d="M19 22 q2.5 -2 5 0 t5 0" fill="none" stroke={cut} />
    </>
  ),
  // Tall sparkling bottle with rising bubbles.
  fizzybottle: ({ body, cut }) => (
    <>
      <Path d="M21 10 h6 v6 q4 3 4 8 v13 q0 3 -3 3 h-8 q-3 0 -3 -3 V24 q0 -5 4 -8 Z" fill={body} />
      <Circle cx={22} cy={33} r={1.3} fill={cut} />
      <Circle cx={26} cy={29} r={1.3} fill={cut} />
      <Circle cx={23} cy={25} r={1.1} fill={cut} />
    </>
  ),
  // Juice carton with a fruit-circle label and a straw.
  juicecarton: ({ body, cut }) => (
    <>
      <Path d="M16 20 h16 v18 q0 2 -2 2 H18 q-2 0 -2 -2 Z" fill={body} />
      <Path d="M16 20 L20 12 h8 l4 8 Z" fill={body} />
      <Path d="M28 12 l4 -5" fill="none" stroke={body} />
      <Circle cx={24} cy={29} r={4} fill={cut} />
    </>
  ),
  // Mug with a handle and steam curls (exterior marks use body).
  coffeemug: ({ body, cut }) => (
    <>
      <Rect x={14} y={20} width={16} height={17} rx={3} fill={body} />
      <Path d="M30 24 q6 1 4 8 q-1 3 -4 2" fill="none" stroke={body} />
      <Path d="M19 16 q2 -3 0 -6 M25 16 q2 -3 0 -6" fill="none" stroke={body} />
      <Path d="M18 27 h8" fill="none" stroke={cut} />
    </>
  ),
  // Teacup on a saucer, tag string over the rim (leaf-green tag: natural).
  teacup: ({ body, cut, leaf }) => (
    <>
      <Path d="M14 22 h18 v5 q0 8 -9 8 q-9 0 -9 -8 Z" fill={body} />
      <Path d="M32 24 q5 1 3 6 q-1 2 -3 1.5" fill="none" stroke={body} />
      <Ellipse cx={23} cy={38} rx={11} ry={2} fill={body} />
      <Path d="M30 22 l4 -7" fill="none" stroke={body} />
      <Rect x={32.5} y={10} width={5} height={5} rx={1} fill={leaf} />
      <Path d="M17 26 h8" fill="none" stroke={cut} />
    </>
  ),
  // Slim soda can with a pull tab and a swoosh.
  sodacan: ({ body, cut }) => (
    <>
      <Rect x={17} y={14} width={14} height={26} rx={3} fill={body} />
      <Path d="M17 17.5 h14" fill="none" stroke={cut} />
      <Circle cx={22} cy={16} r={1.2} fill={cut} />
      <Path d="M20 34 q6 -8 8 -12" fill="none" stroke={cut} />
    </>
  ),
  // Rounded milk jug with a cap, side handle, and label band.
  milkjug: ({ body, cut }) => (
    <>
      <Path d="M19 14 h10 v5 l4 7 v10 q0 4 -4 4 H19 q-4 0 -4 -4 V26 l4 -7 Z" fill={body} />
      <Rect x={20} y={10} width={8} height={4} rx={1} fill={body} />
      <Path d="M33 25 q4 3 2 8" fill="none" stroke={body} />
      <Path d="M17 31 h14" fill="none" stroke={cut} />
    </>
  ),
  // Covered butter dish: base, dome, knob, pat line.
  butterdish: ({ body, cut }) => (
    <>
      <Path d="M13 34 h22 l-2 4 H15 Z" fill={body} />
      <Path d="M16 34 q0 -12 8 -12 q8 0 8 12 Z" fill={body} />
      <Circle cx={24} cy={19} r={2} fill={body} />
      <Path d="M19 30 h6" fill="none" stroke={cut} />
    </>
  ),
```

Tones:

```ts
  waterglass: 'blue', fizzybottle: 'spruce', juicecarton: 'terracotta', coffeemug: 'cocoa',
  teacup: 'fern', sodacan: 'plum', milkjug: 'blue', butterdish: 'ochre',
```

- [ ] **Step 2: Verify**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest src/components/brandGlyphs.test.ts`
Expected: PASS (49 keys both sides).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.ts
git commit -m "feat(brand): drinks-and-fridge staple glyphs (8) — family complete at 49"
```

---

### Task 7: `BrandTile` component (TDD)

**Files:**
- Create: `apps/mobile/src/components/BrandTile.test.tsx`
- Create: `apps/mobile/src/components/BrandTile.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BrandTile } from './BrandTile';

describe('BrandTile', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    render(<BrandTile glyph="floursack" label="Flour" onPress={onPress} />);
    fireEvent.press(screen.getByText('Flour'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes selected state to accessibility and blocks presses when disabled', () => {
    const onPress = jest.fn();
    render(<BrandTile glyph="egg" label="Eggs" selected disabled onPress={onPress} />);
    const tile = screen.getByRole('button', { name: 'Eggs, added' });
    expect(tile.props.accessibilityState).toMatchObject({ selected: true, disabled: true });
    fireEvent.press(tile);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('corner accessory press does not trigger the body onPress', () => {
    const onPress = jest.fn();
    const onCorner = jest.fn();
    render(
      <BrandTile
        glyph="ricebowl"
        label="Rice"
        onPress={onPress}
        cornerAccessory={<Text onPress={onCorner}>refine</Text>}
      />,
    );
    fireEvent.press(screen.getByText('refine'));
    expect(onCorner).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/components/BrandTile.test.tsx`
Expected: FAIL — `Cannot find module './BrandTile'`

- [ ] **Step 3: Implement `BrandTile.tsx`**

```tsx
/**
 * BrandTile — one tappable illustrated tile (Direction B): solid earthy ground
 * panel, cream loaf-mark glyph, label below. Selected = ink outline + ✓ dot.
 * Stateless like QuickAddStaples; the parent owns selection.
 *
 * `cornerAccessory` (optional) renders in the panel's top-right with its own
 * touch handling — Quick Add uses it for the refine chevron. The glyph is
 * decorative; the label (via accessibilityLabel) carries meaning.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';
import { BRAND_CREAM, toneHex, type BrandTone } from '../theme/brandPalette';
import { BrandIcon, FOOD_TONE, type BrandFoodName } from './BrandIcon';

export function BrandTile({
  glyph,
  tone,
  label,
  selected = false,
  disabled = false,
  onPress,
  cornerAccessory,
}: {
  glyph: BrandFoodName;
  /** Ground override; defaults to the glyph's natural tone. */
  tone?: BrandTone;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** Extra corner control (refine chevron). Handles its own presses. */
  cornerAccessory?: React.ReactNode;
}) {
  const ground = toneHex(tone ?? FOOD_TONE[glyph]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={selected ? `${label}, added` : label}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={[styles.panel, { backgroundColor: ground }]}>
        <BrandIcon name={glyph} tone={tone} variant="onColor" size={34} />
        {selected && (
          <View style={styles.checkDot}>
            <Text style={styles.checkTxt}>✓</Text>
          </View>
        )}
        {cornerAccessory !== undefined && <View style={styles.corner}>{cornerAccessory}</View>}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 4,
    alignItems: 'stretch',
  },
  cardSelected: { borderColor: tokens.color.ink },
  panel: {
    borderRadius: 10,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: tokens.color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkTxt: { color: BRAND_CREAM, fontSize: 9, fontFamily: tokens.font.body.semibold },
  corner: { position: 'absolute', top: 2, left: 2 },
  label: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.color.ink,
    textAlign: 'center',
    paddingVertical: 3,
  },
});
```

(Check dot sits top-right; the accessory takes top-left so they never collide when a refined staple is added.)

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && npx jest src/components/BrandTile.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/BrandTile.tsx apps/mobile/src/components/BrandTile.test.tsx
git commit -m "feat(brand): BrandTile — Direction B illustrated picker tile"
```

---

### Task 8: `stapleArt.ts` map + completeness test (TDD)

**Files:**
- Create: `apps/mobile/src/features/pantry/stapleArt.test.ts`
- Create: `apps/mobile/src/features/pantry/stapleArt.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { STAPLE_GROUPS } from './staples';
import { STAPLE_ART, stapleGlyph } from './stapleArt';

describe('stapleArt', () => {
  it('every staple has an explicit glyph (no-sharing rule)', () => {
    for (const group of STAPLE_GROUPS) {
      for (const item of group.items) {
        expect(STAPLE_ART[item.name]).toBeDefined();
      }
    }
  });

  it('no two staples share a glyph', () => {
    const glyphs = Object.values(STAPLE_ART);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('falls back to jar for unknown names', () => {
    expect(stapleGlyph('Some future staple')).toBe('jar');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest src/features/pantry/stapleArt.test.ts`
Expected: FAIL — `Cannot find module './stapleArt'`

- [ ] **Step 3: Implement `stapleArt.ts`**

```ts
/**
 * stapleArt — staple name → loaf-mark glyph, one glyph per staple (enforced
 * by test). Lives beside staples.ts but separate so art changes never touch
 * staple data. Unknown names fall back to 'jar' so a future staple addition
 * can't crash the picker (the completeness test makes the gap loud in CI).
 */
import type { BrandFoodName } from '../../components/BrandIcon';

export const STAPLE_ART: Record<string, BrandFoodName> = {
  // Baking
  Flour: 'floursack',
  Sugar: 'sugarbowl',
  'Brown sugar': 'sugarbag',
  'Baking soda': 'sodabox',
  'Baking powder': 'powdertin',
  Salt: 'saltshaker',
  Yeast: 'yeastpacket',
  // Oils & sauces
  'Olive oil': 'oliveoilbottle',
  'Vegetable oil': 'oiljug',
  'Soy sauce': 'soybottle',
  Ketchup: 'ketchupbottle',
  Mustard: 'mustardbottle',
  Mayonnaise: 'mayojar',
  'Hot sauce': 'hotsaucebottle',
  Vinegar: 'vinegarflask',
  Honey: 'honeypot',
  // Grains & pasta
  Rice: 'ricebowl',
  Pasta: 'spaghetti',
  Oats: 'oatcanister',
  Bread: 'bread',
  // Canned & basics
  'Canned tomatoes': 'tomatocan',
  'Canned beans': 'beancan',
  Stock: 'stockcarton',
  'Black pepper': 'peppergrinder',
  // Drinks
  Water: 'waterglass',
  'Sparkling water': 'fizzybottle',
  'Orange juice': 'juicecarton',
  Coffee: 'coffeemug',
  Tea: 'teacup',
  Soda: 'sodacan',
  // Fridge basics
  Milk: 'milkjug',
  Eggs: 'egg',
  Butter: 'butterdish',
};

export function stapleGlyph(name: string): BrandFoodName {
  const glyph = STAPLE_ART[name];
  if (glyph === undefined && __DEV__) {
    console.warn(`stapleArt: no glyph for "${name}" — falling back to jar`);
  }
  return glyph ?? 'jar';
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/mobile && npx jest src/features/pantry/stapleArt.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/pantry/stapleArt.ts apps/mobile/src/features/pantry/stapleArt.test.ts
git commit -m "feat(pantry): stapleArt map — one glyph per staple, tested"
```

---

### Task 9: `QuickAddStaples` — chips → tile grid

**Files:**
- Modify: `apps/mobile/src/features/pantry/QuickAddStaples.tsx` (full rewrite below)

- [ ] **Step 1: Rewrite the component**

```tsx
/**
 * QuickAddStaples — grouped staple TILES (loaf-mark BrandTile), shared by the
 * Quick Add screen and first-run onboarding. Stateless: the parent owns
 * insertion and the `added` set (which drives the selected ✓ state).
 * `hiddenGroups` lets Quick Add drop sections the user has hidden.
 *
 * `onRefine` (optional): staples whose food has a known kind guide (pasta,
 * rice…) gain a small corner chevron that opens the refine flow — the tile
 * BODY stays instant-add, the chevron is the explicit opt-in. Onboarding
 * omits the prop and renders plain tiles.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { guideFor } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandTile } from '../../components/BrandTile';
import { STAPLE_GROUPS, type Staple } from './staples';
import { stapleGlyph } from './stapleArt';

export function QuickAddStaples({
  added,
  onAdd,
  onRefine,
  hiddenGroups = [],
}: {
  added: string[];
  onAdd: (staple: Staple) => void;
  /** Opens the refine flow for a staple with known kinds. Omit to disable (onboarding). */
  onRefine?: (staple: Staple) => void;
  hiddenGroups?: string[];
}) {
  return (
    <View>
      {STAPLE_GROUPS.filter((group) => !hiddenGroups.includes(group.title)).map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.grid}>
            {group.items.map((s) => {
              const isAdded = added.includes(s.name);
              const refinable = onRefine !== undefined && guideFor(s.name) !== undefined;
              return (
                <View key={s.name} style={styles.cell}>
                  <BrandTile
                    glyph={stapleGlyph(s.name)}
                    label={s.name}
                    selected={isAdded}
                    disabled={isAdded}
                    onPress={() => onAdd(s)}
                    cornerAccessory={
                      refinable ? (
                        <Pressable
                          onPress={() => onRefine?.(s)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Refine ${s.name} — choose kind or brand`}
                          style={styles.refineBtn}
                        >
                          <ChevronDown size={12} color={tokens.color.ink} />
                        </Pressable>
                      ) : undefined
                    }
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const CELL = '23%'; // 4 per row with wrap gaps on standard widths

const styles = StyleSheet.create({
  group: { marginBottom: tokens.space(4) },
  groupTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  cell: { flexBasis: CELL, flexGrow: 1, maxWidth: '25%' },
  refineBtn: {
    backgroundColor: tokens.color.surface,
    borderRadius: 999,
    padding: 2,
    opacity: 0.9,
  },
});
```

- [ ] **Step 2: Typecheck + full mobile suite**

Run: `cd apps/mobile && npx tsc --noEmit && npx jest`
Expected: tsc silent; all suites pass (existing + brandGlyphs + BrandTile + stapleArt).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/pantry/QuickAddStaples.tsx
git commit -m "feat(pantry): staple pickers render BrandTile grids (onboarding + Quick Add)"
```

---

### Task 10: Full verification, push, PR

- [ ] **Step 1: Full local gate (mirrors CI)**

Run from the worktree root:
```bash
npm run lint && (cd apps/mobile && npx tsc --noEmit && npx jest) && npm test --workspace @breadbox/core
```
Expected: lint 0 errors; tsc silent; mobile jest all pass; core vitest 248 pass.

- [ ] **Step 2: Manual QA notes (device/simulator — flag for user if no build available)**

- Onboarding: tiles render 4-across, tap adds (✓ + outline), Continue/Skip unchanged
- Quick Add: hidden groups still hidden; refine chevron opens refine; body tap instant-adds
- Dark mode: panels identical (brand constants), card/label adapt
- VoiceOver: tiles announce "<name>" / "<name>, added"; chevron announces refine

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/brand-tile-staples
gh pr create --base main --title "feat(pantry): illustrated staple tiles — 31 new loaf-mark glyphs + BrandTile" --body "Direction B tiles (spec: docs/superpowers/specs/2026-07-13-brand-tile-staples-design.md). One glyph per staple, no sharing (tested). QuickAddStaples renders tile grids; onboarding + Quick Add inherit. Refine chevron and hiddenGroups preserved.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review

- **Spec coverage:** glyph inventory (Tasks 3–6, all 31 + tones), file split (Task 1), completeness guard (Task 2), BrandTile API incl. cornerAccessory + a11y (Task 7), STAPLE_ART + jar fallback + dev warning (Task 8), tile grid + refine + hiddenGroups (Task 9), testing/verification + QA list (Task 10). `staples.ts` untouched ✓ (spec §5).
- **Placeholders:** Task 1 Step 1 says "paste existing JSX" — intentional for a verbatim move (redrawing would risk drift); everything else is complete code.
- **Type consistency:** `PantryFoodName` union grows across Tasks 3–6 matching each task's record additions; `stapleGlyph`/`STAPLE_ART` names match Task 9's usage; `BrandTile` props in Task 9 match Task 7's definition.
