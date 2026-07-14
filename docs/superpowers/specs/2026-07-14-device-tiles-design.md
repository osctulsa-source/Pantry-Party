# Cook-device tiles — design

**Date:** 2026-07-14
**Status:** decisions user-approved in session; spec pending user review
**Scope:** sub-project 3 of 3 (illustrated tile pickers). Staple tiles shipped in #177, diet/allergy in #178.

## Goal

The Cook tab's "What are you cooking with tonight?" prompt card swaps its text chips for Direction-B
BrandTiles, backed by ~10 new appliance glyphs in the loaf-mark family.

## Decisions (user-approved)

- Branch off main at `68558a7` (post-#178) — avoids conflicts in `brandGlyphs.pantry.tsx` / `RecipesScreen.tsx`.
- Design against main's **committed** device list (6 devices: stove, oven, crockpot, airfryer, grill,
  griddle). The in-flight lazy-kitchen work adds 4 more (instantpot, sheetpan, microwave, nocook) —
  their glyphs are **forward-mapped** now (same approved pattern as the drinks staples), so that branch
  gets art for free when it lands.
- **Grow the card**: the prompt card becomes a 4-column tile grid. The answered-state "Cooking with"
  horizontal chip row is deliberately UNCHANGED — it's a compact status/edit strip, not the moment of
  choice; tiles there would bloat a persistent header control.

## Non-goals

- Touching `packages/core/src/cookingDevice.ts` (owned by the in-flight lazy-kitchen session).
- The answered-state chip row, the "Any" chip, or `useTonightDevices` semantics.
- Device-picker changes anywhere else (settings, onboarding).

## 1 · Ten appliance glyphs (family 52 → 62)

Same construction rule (solid `body` silhouette, 2–3 `cut` interior marks, exterior marks stroke with
`body`); **no `leaf` anywhere — appliances aren't botanical**. Glyph names equal the `CookingDevice`
ids so the art map reads as identity:

| Glyph / device id | Silhouette sketch | Tone |
|---|---|---|
| `stove` | Frying pan: disc + long handle, two sizzle cut-ticks | spruce |
| `oven` | Box, door window (cut rect outline), handle bar | cocoa |
| `crockpot` | Squat pot, lid + knob, two side handles | brick |
| `airfryer` | Tall rounded body, basket-drawer handle slot, vent cut-lines | plum |
| `grill` | Kettle: dome lid + bowl on splayed legs, vent dot | fern |
| `griddle` | Flat plate, front handle nubs, two steam curls (body strokes) | ochre |
| `instantpot`* | Cylinder, flat lid with steam-release valve nub, side handles | blue |
| `sheetpan`* | Rimmed tray in shallow perspective (two nested rounded rects) | terracotta |
| `microwave`* | Wide box, window with cut grid-lines, door seam + button dots | blue |
| `nocook`* | Cutting board with knife laid across, corner hole | cocoa |

*Forward-mapped: not selectable until the lazy-kitchen devices land; the glyphs simply exist in the
family. Tones may repeat across the grid (grounds rotate as elsewhere); glyph-per-device stays unique.

Added to `brandGlyphs.pantry.tsx` (union + record + `PANTRY_TONE`), same file conventions. The
existing glyph/tone completeness test covers them automatically.

## 2 · `deviceArt.ts` (`features/recipes/deviceArt.ts`)

`DEVICE_ART: Record<string, BrandFoodName>` mapping the 10 device ids to their same-named glyphs, plus
a test asserting (a) every `COOKING_DEVICES` entry has an explicit mapping — so a device added without
art fails CI loudly — and (b) no two devices share a glyph. Identity today, but the map keeps the
established art-indirection pattern (stapleArt, dietArt) and insulates the UI from future divergence.

## 3 · Prompt card: chips → tile grid

In `RecipesScreen.tsx`, ONLY the `deviceCardChips` block inside the unanswered prompt card changes:
the `COOKING_DEVICES.map` renders `BrandTile` cells (4-column grid — same `flexBasis '23%'` /
`flexGrow 1` / `maxWidth '25%'` cell math as the other tile grids) instead of chips.

- Multi-select into `pendingDevices` exactly as today; tiles are `selected` when pending,
  never `disabled` (reversible, like the diet step).
- Tile labels use `d.label` (e.g. "Stove / pan"); glyph via `DEVICE_ART[d.id]`.
- Card head (title + X dismiss) and actions row ("Anything goes" / "Show me recipes") unchanged.
- Dead styles (`deviceCardChips` chip-specific styling) removed if unused after the swap; grid styles
  added alongside.

## 4 · Testing & verification

- `deviceArt.test.ts` (coverage + uniqueness, as §2).
- Full suites stay green: mobile jest (31 + new), core vitest 261, lint 0 errors, tsc silent.
- Glyph sheet render (artifact) for the 10 appliances before PR — the can/carton lesson from #177:
  eyeball silhouette distinctness at 34px, especially crockpot vs instantpot (both lidded pots — the
  valve nub + straight cylinder vs squat curve must read) and oven vs microwave (portrait vs landscape
  box + different window treatments).
- Manual QA (dev build): prompt card tiles toggle + "Show me recipes" persists; dismiss works;
  answered chip row unchanged; device boost/badges still apply; dark mode + VoiceOver.

## 5 · Delivery

Branch `feat/device-tiles` (worktree `../Pantry-Party-devices`, off `68558a7`), single PR.
No overlap with lazy-kitchen's files (`cookingDevice.ts` untouched; `RecipesScreen.tsx` has no
uncommitted foreign edits — verified). When lazy-kitchen lands its 4 devices, `DEVICE_ART` and the
glyphs are already in place; its author only extends `COOKING_DEVICES`.
