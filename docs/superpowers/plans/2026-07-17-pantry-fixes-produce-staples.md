# Pantry Fixes + Produce Staples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Collections "Recipes within reach" chip overflow, add Fruits & Vegetables staple groups (with 10 new loaf-mark glyphs) to Quick Add, and keep the Add button reachable while pantry search is open.

**Architecture:** Three independent changes in the Expo mobile app. (1) Style-only wrap/ellipsis fix in `CollectionsScreen`. (2) Data + art: two new groups in the shared `STAPLE_GROUPS` (picked up automatically by Quick Add, onboarding, and the hide-groups config), name→glyph entries in `STAPLE_ART`, and 10 new SVG glyphs in the `PANTRY_GLYPHS` record (the `Record<PantryFoodName, …>` type makes missing glyph/tone entries a compile error). (3) A compact `+` button appended to the pantry search band, opening the existing add menu.

**Tech Stack:** React Native (Expo), react-native-svg, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-07-17-pantry-fixes-produce-staples-design.md`

**Working branch:** `feat/pantry-fixes-produce-staples` (already created; spec committed).

**Commands (run from `apps/mobile/`):**
- Tests: `npm test` (jest). Root-level typecheck is known-broken — always typecheck from `apps/mobile` with `npx tsc --noEmit`.

---

### Task 1: Collections chip overflow fix

Long recipe titles in the "Recipes within reach" teaser chips run off screen: the chip row has no wrap and chips never shrink.

**Files:**
- Modify: `apps/mobile/src/features/insights/CollectionsScreen.tsx` (chip render ~line 359–374; styles `cookChips`/`rchip`/`rchipText` ~line 580–582)

This is a style-only change with no logic to unit-test (the project has no RN snapshot infra for this screen); verification is typecheck + on-device in Task 5.

- [ ] **Step 1: Wrap the chip row and let chips shrink**

In `styles` (currently):

```ts
cookChips: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(2) },
rchip: { backgroundColor: tokens.color.surface, borderRadius: 999, paddingHorizontal: tokens.space(3), paddingVertical: tokens.space(1) },
```

Change to:

```ts
cookChips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginTop: tokens.space(2) },
rchip: { backgroundColor: tokens.color.surface, borderRadius: 999, paddingHorizontal: tokens.space(3), paddingVertical: tokens.space(1), flexShrink: 1, maxWidth: '100%' },
```

- [ ] **Step 2: Truncate pathologically long titles**

In the `withinReach` chip map (~line 361), the text element currently reads:

```tsx
<Text style={styles.rchipText}>
  {match.recipe.title} (need {match.missing.length})
</Text>
```

Change to:

```tsx
<Text style={styles.rchipText} numberOfLines={1} ellipsizeMode="tail">
  {match.recipe.title} (need {match.missing.length})
</Text>
```

Leave the placeholder `? · ? · ?` chips untouched.

- [ ] **Step 3: Typecheck**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/insights/CollectionsScreen.tsx
git commit -m "fix(collections): wrap recipes-within-reach chips so long titles stay on screen"
```

---

### Task 2: Ten new produce glyphs (brandGlyphs.pantry.tsx)

New loaf-mark glyphs: `banana`, `orange`, `strawberry`, `avocadohalf`, `lime`, `onion`, `garlic`, `potato`, `broccoli`, `lettuce`. Same 48×48 two-tone style as the existing record: solid `body` shapes, thin `cut` detail strokes/dots, `leaf` for foliage (paint colors are injected — see `BrandIcon.tsx`; the wrapping `<G>` supplies `strokeWidth={3}` and round caps/joins, matching the core family). The `avocadohalf` name is deliberate — Collections' `collectionIcons.tsx` has its own separate `avocado` in a different glyph family; keep the names unambiguous.

The `Record<PantryFoodName, …>` types on `PANTRY_GLYPHS` and `PANTRY_TONE` mean: extend the union first, and the compiler forces both records complete. That's the "failing test" for this task.

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.pantry.tsx` (`PantryFoodName` union ~line 12–17; `PANTRY_GLYPHS` record; `PANTRY_TONE` ~line 429–442)

- [ ] **Step 1: Extend the `PantryFoodName` union (compile-error-first)**

Append a produce line to the union before the appliance line:

```ts
export type PantryFoodName =
  | 'floursack' | 'sugarbowl' | 'sugarbag' | 'sodabox' | 'powdertin' | 'saltshaker' | 'yeastpacket'
  | 'oliveoilbottle' | 'oiljug' | 'soybottle' | 'ketchupbottle' | 'mustardbottle' | 'mayojar' | 'hotsaucebottle' | 'vinegarflask' | 'honeypot'
  | 'ricebowl' | 'spaghetti' | 'oatcanister' | 'tomatocan' | 'beancan' | 'stockcarton' | 'peppergrinder'
  | 'waterglass' | 'fizzybottle' | 'juicecarton' | 'coffeemug' | 'teacup' | 'sodacan' | 'milkjug' | 'butterdish' | 'wheat' | 'peanut' | 'shrimp'
  | 'banana' | 'orange' | 'strawberry' | 'avocadohalf' | 'lime' | 'onion' | 'garlic' | 'potato' | 'broccoli' | 'lettuce'
  | 'stove' | 'oven' | 'crockpot' | 'airfryer' | 'grill' | 'griddle' | 'instantpot' | 'sheetpan' | 'microwave' | 'nocook';
```

- [ ] **Step 2: Verify the compiler now demands the glyphs**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: FAIL — `PANTRY_GLYPHS` and `PANTRY_TONE` are missing the 10 new properties.

- [ ] **Step 3: Add the 10 glyph drawings to `PANTRY_GLYPHS`**

Insert after the `shrimp` entry (keep the record grouped like the union). Each is a `(c: Paint) => ReactNode` like its neighbors:

```tsx
  // ----- Produce (Quick Add fruits & vegetables) -----
  // Curved crescent with a ridge line and a stem nub.
  banana: ({ body, cut }) => (
    <>
      <Path d="M13 18 Q14 34 30 36 Q37 37 38 31 Q37 33 30 32 Q17 30 16 17 Q16 14 14 14 Q12 14 13 18 Z" fill={body} />
      <Path d="M18 22 Q21 30 28 33" fill="none" stroke={cut} strokeWidth={2} />
    </>
  ),
  // Round body, navel dimple, single leaf.
  orange: ({ body, cut, leaf }) => (
    <>
      <Circle cx={24} cy={27} r={11} fill={body} />
      <Circle cx={24} cy={22} r={1.6} fill={cut} />
      <Path d="M25 15 C29 11 34 12 34 12 C34 16 30 18 26 17 Z" fill={leaf} />
    </>
  ),
  // Tapered berry, seed dots, leafy cap.
  strawberry: ({ body, cut, leaf }) => (
    <>
      <Path d="M14 22 Q14 18 24 18 Q34 18 34 22 Q34 32 24 38 Q14 32 14 22 Z" fill={body} />
      <Circle cx={20} cy={25} r={1.3} fill={cut} />
      <Circle cx={28} cy={25} r={1.3} fill={cut} />
      <Circle cx={24} cy={30} r={1.3} fill={cut} />
      <Path d="M24 18 L19 13 L23 15 L24 11 L25 15 L29 13 Z" fill={leaf} />
    </>
  ),
  // Halved avocado: teardrop shell, round pit.
  avocadohalf: ({ body, cut }) => (
    <>
      <Path d="M24 10 Q29 16 32 22 Q36 30 30 35 Q24 39 18 35 Q12 30 16 22 Q19 16 24 10 Z" fill={body} />
      <Circle cx={24} cy={28} r={5} fill={cut} />
    </>
  ),
  // Citrus round with wedge segment lines.
  lime: ({ body, cut }) => (
    <>
      <Circle cx={24} cy={25} r={11} fill={body} />
      <Path d="M24 25 V16 M24 25 L32 21 M24 25 L32 30 M24 25 L24 34 M24 25 L16 30 M24 25 L16 21" fill="none" stroke={cut} strokeWidth={2} />
    </>
  ),
  // Bulb with layer curves and a sprout.
  onion: ({ body, cut, leaf }) => (
    <>
      <Path d="M24 17 Q35 22 35 30 Q35 38 24 38 Q13 38 13 30 Q13 22 24 17 Z" fill={body} />
      <Path d="M20 20 Q17 27 19 35" fill="none" stroke={cut} strokeWidth={2} />
      <Path d="M28 20 Q31 27 29 35" fill="none" stroke={cut} strokeWidth={2} />
      <Path d="M24 17 V11 M24 14 L20 9 M24 14 L28 9" fill="none" stroke={leaf} />
    </>
  ),
  // Plump head with clove divisions and a papery tip.
  garlic: ({ body, cut }) => (
    <>
      <Path d="M24 14 Q26 19 30 22 Q36 27 33 34 Q30 39 24 39 Q18 39 15 34 Q12 27 18 22 Q22 19 24 14 Z" fill={body} />
      <Path d="M24 22 V39" fill="none" stroke={cut} strokeWidth={2} />
      <Path d="M19 25 Q17 32 20 38" fill="none" stroke={cut} strokeWidth={2} />
      <Path d="M29 25 Q31 32 28 38" fill="none" stroke={cut} strokeWidth={2} />
    </>
  ),
  // Lumpy oval with eye dots.
  potato: ({ body, cut }) => (
    <>
      <Path d="M13 27 Q12 19 20 18 Q26 15 32 19 Q38 23 35 30 Q33 37 25 37 Q15 37 13 27 Z" fill={body} />
      <Circle cx={20} cy={25} r={1.4} fill={cut} />
      <Circle cx={28} cy={23} r={1.2} fill={cut} />
      <Circle cx={26} cy={31} r={1.4} fill={cut} />
    </>
  ),
  // Cloud of florets on a stout stem.
  broccoli: ({ body, cut }) => (
    <>
      <Path d="M21 27 h6 l1 12 h-8 Z" fill={body} />
      <Path d="M12 21 Q12 14 19 14 Q21 9 27 10 Q33 9 34 15 Q39 17 37 23 Q35 28 29 27 L19 27 Q13 27 12 21 Z" fill={body} />
      <Circle cx={19} cy={19} r={1.4} fill={cut} />
      <Circle cx={26} cy={16} r={1.4} fill={cut} />
      <Circle cx={31} cy={21} r={1.4} fill={cut} />
    </>
  ),
  // Layered head, outer leaves swooping up.
  lettuce: ({ body, cut }) => (
    <>
      <Path d="M12 30 Q10 20 19 17 Q24 12 30 16 Q38 17 36 27 Q36 35 24 36 Q13 36 12 30 Z" fill={body} />
      <Path d="M18 21 Q16 27 18 34" fill="none" stroke={cut} strokeWidth={2} />
      <Path d="M24 18 Q23 26 24 36" fill="none" stroke={cut} strokeWidth={2} />
      <Path d="M30 20 Q32 27 30 34" fill="none" stroke={cut} strokeWidth={2} />
    </>
  ),
```

Note the file already imports `Circle` and `Path` from react-native-svg (used by existing entries) — no import changes expected; verify at the top of the file.

- [ ] **Step 4: Add tones to `PANTRY_TONE`**

Insert a produce line before the appliance line:

```ts
  banana: 'ochre', orange: 'terracotta', strawberry: 'brick', avocadohalf: 'olive', lime: 'fern',
  onion: 'plum', garlic: 'blue', potato: 'cocoa', broccoli: 'fern', lettuce: 'olive',
```

- [ ] **Step 5: Typecheck passes**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.tsx
git commit -m "feat(brand): 10 produce loaf-mark glyphs for quick-add staples"
```

---

### Task 3: Fruits & Vegetables staple groups + art mappings

Shared `STAPLE_GROUPS` drives Quick Add, onboarding, and the hide-groups config (all title-based and dynamic — no other files need edits). The existing `stapleArt.test.ts` completeness test is the failing test here.

**Files:**
- Modify: `apps/mobile/src/features/pantry/staples.ts`
- Modify: `apps/mobile/src/features/pantry/stapleArt.ts`
- Test (existing): `apps/mobile/src/features/pantry/stapleArt.test.ts`

- [ ] **Step 1: Add the two groups to `STAPLE_GROUPS`**

Insert between "Canned & basics" and "Drinks". All `category: 'produce'` (core's schema gives produce its own short expiry default); none are `noExpiry`:

```ts
  {
    title: 'Fruits',
    items: [
      { name: 'Apple', category: 'produce', location: 'pantry' },
      { name: 'Banana', category: 'produce', location: 'pantry' },
      { name: 'Lemon', category: 'produce', location: 'pantry' },
      { name: 'Orange', category: 'produce', location: 'pantry' },
      { name: 'Grapes', category: 'produce', location: 'fridge' },
      { name: 'Strawberries', category: 'produce', location: 'fridge' },
      { name: 'Avocado', category: 'produce', location: 'pantry' },
      { name: 'Lime', category: 'produce', location: 'pantry' },
    ],
  },
  {
    title: 'Vegetables',
    items: [
      { name: 'Onion', category: 'produce', location: 'pantry' },
      { name: 'Garlic', category: 'produce', location: 'pantry' },
      { name: 'Potato', category: 'produce', location: 'pantry' },
      { name: 'Carrot', category: 'produce', location: 'fridge' },
      { name: 'Tomato', category: 'produce', location: 'pantry' },
      { name: 'Bell pepper', category: 'produce', location: 'fridge' },
      { name: 'Broccoli', category: 'produce', location: 'fridge' },
      { name: 'Lettuce', category: 'produce', location: 'fridge' },
    ],
  },
```

- [ ] **Step 2: Run the staple-art test to see it fail**

Run (from `apps/mobile/`): `npm test -- stapleArt`
Expected: FAIL — "every staple has an explicit glyph" reports `undefined` for the 16 new names.

- [ ] **Step 3: Map the 16 names in `STAPLE_ART`**

Insert after the "Canned & basics" block, mirroring the group order. Six reuse core glyphs; ten use the new pantry glyphs. The test's no-sharing rule holds: none of these glyph values are used elsewhere in `STAPLE_ART`.

```ts
  // Fruits
  Apple: 'apple',
  Banana: 'banana',
  Lemon: 'lemon',
  Orange: 'orange',
  Grapes: 'grapes',
  Strawberries: 'strawberry',
  Avocado: 'avocadohalf',
  Lime: 'lime',
  // Vegetables
  Onion: 'onion',
  Garlic: 'garlic',
  Potato: 'potato',
  Carrot: 'carrot',
  Tomato: 'tomato',
  'Bell pepper': 'pepper',
  Broccoli: 'broccoli',
  Lettuce: 'lettuce',
```

- [ ] **Step 4: Test passes**

Run (from `apps/mobile/`): `npm test -- stapleArt`
Expected: PASS (all three cases, including no-sharing).

- [ ] **Step 5: Typecheck**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/pantry/staples.ts apps/mobile/src/features/pantry/stapleArt.ts
git commit -m "feat(pantry): fruits & vegetables staple groups in quick add"
```

---

### Task 4: Keep Add reachable while pantry search is open

The pantry control band renders exactly one of bulk bar / search / Add button; opening search hides Add. Add a compact accent `+` inside the search band that opens the same add menu. The one-band rule and search state stay untouched.

**Files:**
- Modify: `apps/mobile/src/features/pantry/PantryScreen.tsx` (search band ~line 595–621; styles ~line 1041–1055)

No unit test — this is a small JSX addition wiring an existing handler (`setAddMenuOpen(true)`), verified on-device in Task 5.

- [ ] **Step 1: Add the `+` button to the search band**

After the close-`X` `Pressable` (ends ~line 620), inside `styles.searchWrap`'s row, add:

```tsx
          <Pressable
            onPress={() => setAddMenuOpen(true)}
            style={[styles.searchAdd, { backgroundColor: zoneTheme.accent }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add items to your pantry"
          >
            <Plus size={16} color={zoneTheme.onAccent} />
          </Pressable>
```

`Plus`, `setAddMenuOpen`, and `zoneTheme` are all already in scope in this component (the Add band below uses them).

- [ ] **Step 2: Add the style**

Next to `searchClose` in the StyleSheet:

```ts
  searchAdd: {
    borderRadius: 999,
    padding: tokens.space(1.5),
    marginVertical: -tokens.space(1),
  },
```

(The negative vertical margin keeps the band height identical to today's search band.)

- [ ] **Step 3: Typecheck**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/pantry/PantryScreen.tsx
git commit -m "fix(pantry): keep add reachable while search is open"
```

---

### Task 5: Full verification

- [ ] **Step 1: Full mobile test suite**

Run (from `apps/mobile/`): `npm test`
Expected: all suites PASS (includes `stapleArt.test.ts` with the 16 new staples).

- [ ] **Step 2: Typecheck (apps/mobile only — root typecheck is known-broken)**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint (gates CI)**

Run (from repo root): `npm run lint`
Expected: no errors.

- [ ] **Step 4: On-device / simulator QA (user or expo start)**

- Collections → "The undiscovered" → Recipes within reach: chips wrap to a second line with a long recipe title; nothing runs off screen.
- Quick Add: Fruits and Vegetables groups appear after "Canned & basics" with the new glyphs; tapping adds with a produce expiry default; groups can be hidden via the existing hide-groups config.
- Onboarding staple picker: both new groups appear with plain tiles.
- Pantry → search icon: search band shows field, X, and accent `+`; tapping `+` opens the add menu without closing search; X still closes search and restores the "Add items" band.

- [ ] **Step 5: Final commit if QA fixes were needed, then hand off**

Branch stays `feat/pantry-fixes-produce-staples`; PR after the user's on-device QA.
