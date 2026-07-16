# Cook Mode animated technique glyphs — design

**Date:** 2026-07-16
**Status:** approved (brainstorm validated with HTML mockups: `cook-motion-mockups.html`, repo root, untracked)

## Problem

Cook Mode is the "calm cook-along" for nervous cooks, but steps describe motions in
words only ("dice", "fold", "simmer"). A small looping animation of the technique
reassures and lightly teaches without adding reading load. It must fit the app's
constraints: no new native modules (OTA-shippable; `ios/` dir is load-bearing on
Windows), and it must read as part of the loaf-mark brand family.

## Decisions made during brainstorm

- **Placement:** constant inline hero slot inside the Cook Mode step card, above the
  step text (~110 pt cream stage) — mockup option A.
- **Fallback:** the slot never disappears. Steps with no matched technique show a calm
  stage-aware glyph (prep / cooking / finishing) so layout never jumps between steps.
- **Technique set (v1, 12):** chop, stir, simmer, flip/sauté, knead/fold, season,
  pour/drain, grate/zest, roll/flatten, rest/cool, preheat/bake, mash/blend.
- **Matching:** hybrid — runtime keyword matcher for all recipes (Spoonacular included),
  optional authored per-step `technique` override in the curated pipeline that wins
  when present. No authoring sweep in v1; overrides added case-by-case.
- **Motion style:** calm 1–2.5 s loops, transform + opacity only (validated in mockups,
  including the revised two-beat knead rhythm with the leaf riding the dough).

## Architecture

No new dependencies: `react-native-svg` + core `Animated`.

### Components

**`apps/mobile/src/components/brandGlyphs.technique.tsx`**
Twelve technique glyphs plus three stage-fallback glyphs, following the existing
construction rules (`Paint` interface, solid silhouette, cream cut-marks, stroke 3,
one leaf where natural). Each glyph is split into a **static base layer** and **1–3
animatable layers** (e.g. chop = carrot base + knife layer), each layer a function of
`Paint` returning SVG nodes, so the pieces also compose into a static icon for use
elsewhere.

**`apps/mobile/src/components/techniqueMotion.ts`**
Declarative motion spec per technique: loop duration, and per-layer keyframes over
transform (translate/rotate/scale) and opacity, plus a `transformOrigin`. One shared
hook drives all specs with `Animated.loop(Animated.sequence(...))`. No bespoke
animation code per glyph.

**`apps/mobile/src/components/TechniqueGlyph.tsx`**
Renders a technique (or stage fallback) at a given size. Stacks the base `Svg` and
each animatable layer as its own absolutely-positioned `Svg` inside an
`Animated.View`. Animating Views (not SVG props) keeps every loop on the **native
driver**, off the JS thread. Decorative: hidden from assistive tech like `BrandIcon`;
respects OS reduce-motion (`AccessibilityInfo.isReduceMotionEnabled`) by freezing on
the rest frame. Stops loops on unmount.

**`apps/mobile/src/features/recipes/matchTechnique.ts`**
Pure function `matchTechnique(stepText: string): Technique | null`. Ordered rule
list, first match wins, with negative guards ("do not stir" → no match). Exported
rule table so tests can assert coverage. Same precedent as `parseMinutes` in
CookModeView.

**Resolution order** (small helper alongside the matcher):
authored `technique` → `matchTechnique(text)` → stage fallback. Stage fallback rule:
first step → prep, last step → finishing, everything between → cooking.

### Data pipeline (curated recipes)

- Optional per-step `technique` field in `data/recipes/curated.json` and
  `data/recipes/curated.variants.json`: enum of the 12 technique ids plus `"none"`
  (suppress matcher, force stage fallback).
- `data/recipes/validate.mjs` validates the enum on both base and variants.
- Two-copy rule applies: authoring source under `data/recipes/`, byte-identical
  bundle copy under `apps/mobile/src/data/curated/`.
- Runtime parse is defensive (posture of `curatedVariants.ts`): unrecognized values
  fall through to the matcher/fallback.

### Cook Mode wiring

- CookModeView step card gains the hero stage above the step text; mise-en-place
  phase untouched.
- Animations pause while the finish/confirm modal is up; stop on unmount.
- Works identically for Spoonacular recipes (matcher only) and curated recipes
  (override-aware), including device variants via the existing `effectiveRecipe`.

## Error handling

- Bad authored values are caught at validation time; at runtime they fall through
  the resolution chain — worst case is a stage-fallback glyph.
- The hero is isolated from step content: a glyph failure degrades to an empty cream
  stage, never a broken step screen.

## Testing

- **Matcher unit tests:** every technique's keywords, negative guards, first-match
  precedence, no-match → null.
- **Resolution tests:** authored > matched > fallback; `"none"` suppression; stage
  fallback selection across step positions.
- **Motion spec tests:** every technique + stage id has a spec; durations within
  1–2.5 s; layers referenced by specs exist on the glyph.
- **Glyph smoke tests:** mirror `brandGlyphs.test.ts` for the new family.
- **Pipeline:** validate.mjs rejects unknown enum values; accepts valid ones.
- **Manual QA:** one curated recipe with an authored override, one Spoonacular
  recipe, reduce-motion on and off, timer modal pause, dark mode.

## Out of scope (v1)

- Tap-for-tips bottom sheet (mockup option B).
- Animations outside Cook Mode (recipe detail, step lists).
- Keyword localization (English only, matching current recipe content).
- Lottie / Rive / Reanimated / Skia adoption.
