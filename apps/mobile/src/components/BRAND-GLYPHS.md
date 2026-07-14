# Brand glyph & tile system — authoring guide

The "loaf mark" illustration family: flat, single-silhouette food/appliance icons
that read as one brand across every color. This guide is the contract for adding
new glyphs. **Read it fully before creating content — the coverage tests will
fail CI if you skip a step.**

## Where everything lives

| File | Role |
|---|---|
| `apps/mobile/src/theme/brandPalette.ts` | The color system: 9 earthy **grounds**, plus the two constants (`BRAND_CREAM`, `BRAND_LEAF`) and `toneHex()`. |
| `apps/mobile/src/components/brandGlyphs.core.tsx` | The original 18 food glyphs + the `Paint` type + `CoreFoodName` union. |
| `apps/mobile/src/components/brandGlyphs.pantry.tsx` | 44 staple/appliance glyphs + `PantryFoodName` union + `PANTRY_TONE` map. **New glyphs almost always go here.** |
| `apps/mobile/src/components/BrandIcon.tsx` | Merges both records, owns `FOOD_TONE`, `BrandFoodName`, renders the SVG. |
| `apps/mobile/src/components/BrandTile.tsx` | The tappable illustrated tile (Direction B): ground panel + cream glyph + label + selected state. |
| `apps/mobile/src/components/brandGlyphs.test.ts` | **Coverage gate** — every toned name must have a glyph and vice-versa. |
| `apps/mobile/src/features/pantry/stapleArt.ts` | staple name → glyph map (`STAPLE_ART` + `stapleGlyph()` fallback). |
| `apps/mobile/src/features/onboarding/dietArt.ts` | diet/allergy option → glyph map. |
| `apps/mobile/src/features/recipes/deviceArt.ts` | cooking device → glyph map. |
| `*Art.test.ts` (beside each map) | completeness + uniqueness gates for each art map. |
| `apps/mobile/src/components/illustrations/*.tsx` | Larger empty-state scene illustrations (separate from glyphs — same palette). |

There is **no** `docs/design-system/` directory in the repo; the feature design
specs live in `docs/superpowers/specs/`.

## Construction rules (every glyph obeys these)

- **Canvas:** `viewBox="0 0 48 48"`. Compose art roughly within x/y 10–38 so it
  sits centered with breathing room.
- **Three paints** arrive as a `Paint` object: `{ body, cut, leaf }`.
  - `body` = the solid silhouette fill.
  - `cut` = interior detail marks (seams, ridges, holes). Use **2–3**, no more —
    the family is minimal.
  - `leaf` = the single green accent, used **only where botanically natural**
    (fruit/veg/herb stems). Appliances and packaged goods get **no leaf**.
- **Marks that sit OUTSIDE the silhouette** (steam, handle gaps, strings, pour
  lines) must stroke with **`body`**, never `cut`. On a colored tile `cut` equals
  the panel color, so an exterior `cut` mark is invisible. This is the #1 mistake.
- **Stroke weight is inherited** — the parent `<G strokeWidth={3}
  strokeLinecap="round" strokeLinejoin="round">` sets it. Never hardcode
  `strokeWidth` on a child; just use `stroke={cut}` / `stroke={body}` and
  `fill="none"` for line marks.
- Use `react-native-svg` primitives only: `Path`, `Circle`, `Ellipse`, `Rect`.
- Each glyph is a **pure function** `({ body, cut, leaf }) => JSX` returning a
  fragment. No state, no props beyond the paint.

## The palette (brandPalette.ts)

Nine grounds, all muted/warm so the set reads as a family:
`terracotta, brick, ochre, cocoa, olive, fern, spruce, blue, plum`.
Two constants: `BRAND_CREAM #F2EDE1`, `BRAND_LEAF #2C5C39`.

On a tile (`variant: 'onColor'`, the default): silhouette = cream, cut marks =
the ground color, leaf = green. Pick a ground that suits the food's natural color
(tomato→brick, lemon→ochre, herb→cocoa/fern). Grouped items can echo meaning.

## How to add a new glyph (checklist)

Adding e.g. a `blender` appliance glyph:

1. **Union** — add `'blender'` to the `PantryFoodName` union in
   `brandGlyphs.pantry.tsx`.
2. **Glyph** — add the drawing function to `PANTRY_GLYPHS`, following the rules
   above. Keep it to a silhouette + 2–3 cut marks, no leaf for an appliance.
3. **Tone** — add `blender: '<ground>'` to `PANTRY_TONE` (same file, near the
   bottom). Every glyph MUST have a tone or the coverage test fails.
4. **Art map** — map the user-facing name to the glyph in the relevant `*Art.ts`
   (e.g. `deviceArt.ts`: `Blender: 'blender'`). Names not in a map fall back to
   `jar`/`spoon` with a `__DEV__` warning — the completeness test makes gaps loud.
5. **Tests** — the existing `brandGlyphs.test.ts` and the per-map `*Art.test.ts`
   cover it automatically; run `npx jest` from `apps/mobile` and confirm green.
   Add a case only if you introduced a new map.

Tip for parallel work: you can **forward-map** a name in an `*Art.ts` before the
staple/device data lands (the art map keys are plain strings). The glyph just
waits unused until the data references it — this is how drinks/appliances were
staged ahead of their feature branches.

## Verification (run before you claim done)

From `apps/mobile`: `npx tsc --noEmit` then `npx jest`. Coverage/uniqueness
gates live in `brandGlyphs.test.ts` and the three `*Art.test.ts` files. See the
repo's verification notes for the full CI gate (lint + core + api).
