# Brand tiles for staple pickers — design

**Date:** 2026-07-13
**Status:** approved direction (Direction B mockup), spec pending user review
**Scope:** sub-project 1 of 3 (illustrated tile pickers). Diet/allergy step and cook-device tiles are separate specs.

## Goal

Replace the text-chip staple pickers (first-run onboarding and Quick Add) with illustrated tiles in the
loaf-mark brand style: a solid earthy ground panel, a cream food silhouette with a single green leaf where
natural, label below — the app-icon construction rule applied to a tappable input. Chosen from three mocked
directions ("Direction B", artifact `cc851a6e`).

## Non-goals

- Diet/allergy onboarding step (sub-project 2)
- Cook-device tiles / appliance glyphs (sub-project 3)
- Any change to `addPantryItem`, expiry suggestion, or staple data semantics
- Redesign of chips elsewhere (zone chips, suggest chips, passport chips stay as they are)

## 1 · Glyph inventory — one glyph per staple, no sharing

Per user decision, every staple gets its own distinct silhouette. Two staples already have exact marks in
the family (`bread`, `egg`); the other 31 are new. All follow the construction rule: solid silhouette,
2–3 cut-marks in the ground color, one `BRAND_LEAF` accent only where botanically natural. Each gets a
`FOOD_TONE` entry; tones are distributed within each staple group so adjacent tiles vary.

| Staple | Glyph key | Silhouette sketch | Tone |
|---|---|---|---|
| Flour | `floursack` | Rolled-top sack, stitch cut-marks | ochre |
| Sugar | `sugarbowl` | Lidded bowl, knob on top, cube beside | blue |
| Brown sugar | `sugarbag` | Soft bag with fold, scoop mark | cocoa |
| Baking soda | `sodabox` | Upright open box, arm-crease cut | spruce |
| Baking powder | `powdertin` | Squat round tin with lid lip | terracotta |
| Salt | `saltshaker` | Domed shaker, 3 hole dots | blue |
| Yeast | `yeastpacket` | Sachet with torn corner | ochre |
| Olive oil | `oliveoilbottle` | Slim cruet + spout, olive-leaf accent | olive |
| Vegetable oil | `oiljug` | Handled jug, cap | ochre |
| Soy sauce | `soybottle` | Narrow-waist bottle, collar cut | cocoa |
| Ketchup | `ketchupbottle` | Squeeze bottle, cone cap | brick |
| Mustard | `mustardbottle` | Squeeze bottle, pointed nozzle | ochre |
| Mayonnaise | `mayojar` | Wide jar, tall lid band | blue |
| Hot sauce | `hotsaucebottle` | Small bottle, ringed cap, flame-ish drip cut | brick |
| Vinegar | `vinegarflask` | Corked flask, shoulder curve | plum |
| Honey | `honeypot` | Pot + dipper handle crossing rim | ochre |
| Rice | `ricebowl` | Bowl with mound, grain dots | terracotta |
| Pasta | `spaghetti` | Standing bundle, tie band cut | ochre |
| Oats | `oatcanister` | Cylinder canister, band cut | cocoa |
| Canned tomatoes | `tomatocan` | Can with tomato-circle label mark | brick |
| Canned beans | `beancan` | Can with two bean-dot label marks | cocoa |
| Stock | `stockcarton` | Gable-top carton | spruce |
| Black pepper | `peppergrinder` | Waisted grinder, crank knob | cocoa |
| Water | `waterglass` | Tumbler, wave cut-line | blue |
| Sparkling water | `fizzybottle` | Tall bottle, 3 bubble dots | spruce |
| Orange juice | `juicecarton` | Carton with circle fruit mark | terracotta |
| Coffee | `coffeemug` | Mug + handle, steam cut-curl | cocoa |
| Tea | `teacup` | Cup on saucer, tag string over rim, leaf accent | fern |
| Soda | `sodacan` | Slim can, pull-tab cut | plum |
| Milk | `milkjug` | Rounded jug, cap + label band | blue |
| Butter | `butterdish` | Covered dish, dome handle, pat corner cut | ochre |
| Bread | `bread` *(existing)* | — | terracotta |
| Eggs | `egg` *(existing)* | — | blue |

Note: `tomatocan` is its own drawing — it does NOT reuse the fresh `tomato` glyph. Total: 31 new + 2
existing = all 33 staples covered.

Appliance glyphs are explicitly deferred to sub-project 3.

### File organization

`BrandIcon.tsx` currently holds 18 glyph functions (~240 lines); +31 would triple it. Split:

- `components/brandGlyphs.core.ts` — the existing 18 (moved verbatim)
- `components/brandGlyphs.pantry.ts` — the 31 new staple glyphs
- `BrandIcon.tsx` — merges the records, keeps `BrandFoodName`, `FOOD_TONE`, `BrandIcon`, `BRAND_FOODS` exports;
  its public API is unchanged, so all existing callers (ornaments, loaders, empty states, Collections) compile untouched.

Glyph functions keep the exact `(paint: {body, cut, leaf}) => ReactNode` shape at viewBox 48×48,
strokeWidth 3, so new glyphs work in both `onColor`/`onLight` variants and every BrandDecor context for free.

## 2 · `BrandTile` component — `components/BrandTile.tsx`

Stateless, like `QuickAddStaples`. Direction B rendering:

```
Props {
  glyph: BrandFoodName;          // panel ground defaults to FOOD_TONE[glyph]
  tone?: BrandTone;              // override
  label: string;
  selected?: boolean;            // ink outline + ✓ dot, label unchanged
  disabled?: boolean;
  onPress: () => void;
  cornerAccessory?: ReactNode;   // Quick Add refine chevron; own Pressable + hitSlop
}
```

- Card: `tokens.color.surface` background, radius 14, 1.5px transparent border → `tokens.color.ink` when selected
- Panel: square, radius 10, ground color, centered `BrandIcon variant="onColor"` size 34
- Label: 11px `body.semibold`, `tokens.color.ink`, single line, below panel
- ✓ dot: 14px ink circle, cream check, top-right of panel — mirrors the mockup
- A11y: `accessibilityRole="button"`, `accessibilityState={{ selected, disabled }}`, `accessibilityLabel`
  = label (or `"Add <label>"` / `"<label>, added"`); glyph is decorative
- Grounds are brand constants (identical light/dark, like the app icon); card + label read from theme tokens
  so dark mode works with no extra branches. No animation → no Reduce Motion handling needed.

Layout is the caller's: tiles are fixed-flex items in a `flexWrap` row (4 per row on standard widths,
`gap: tokens.space(2)`), matching how `chips` rows already lay out.

## 3 · Surface changes

### `QuickAddStaples.tsx`

- Chip row → tile grid per group (group titles unchanged)
- `STAPLE_ART: Record<string, { glyph: BrandFoodName; tone?: BrandTone }>` in a new `stapleArt.ts` beside
  `staples.ts` — keyed by staple name; a missing entry falls back to the `jar` glyph so a future staple
  addition cannot crash the picker (and a dev-only warning makes the gap visible).
- Added state: tile switches to `selected` (stays tappable-disabled, same as today's ✓ chip)
- `onRefine` staples render the chevron via `cornerAccessory` — body tap still instant-adds; a11y label
  preserved ("Refine <name> — choose kind or brand")
- `hiddenGroups` behavior unchanged

### Onboarding — no changes

`OnboardingScreen` already delegates to `QuickAddStaples`; it inherits tiles. The scroll gets longer
(tiles are taller than chips) — acceptable; the screen already scrolls.

### Quick Add — no logic changes

Same delegation; refine flow and hidden groups verified in QA.

## 4 · Testing & verification

- `BrandTile.test.tsx` (jest, patterns from `ui.test.tsx`): renders label, fires onPress, exposes
  `selected` a11y state, corner accessory tap does not trigger body onPress
- `stapleArt` unit test: every `STAPLE_GROUPS` item has an explicit `STAPLE_ART` entry (locks the
  no-sharing rule and catches drift when staples are added)
- Existing suites must stay green: `apps/mobile` jest 14/14 + new, core vitest 248
- Manual QA: onboarding add + skip, Quick Add add/refine/hidden-groups, dark mode pass, VoiceOver pass
- Commands: `apps/mobile` `npx tsc --noEmit`, `npm run lint` (errors gate CI), workspace tests

## 5 · Delivery

Branch `feat/brand-tile-staples` (worktree `../Pantry-Party-tiles`, off main at `f8754d9`), single PR.
The main checkout's uncommitted work (lazy-kitchen-devices etc.) is not touched; `staples.ts` itself is
NOT modified (new `stapleArt.ts` avoids colliding with the in-flight staples edits in the main checkout).
