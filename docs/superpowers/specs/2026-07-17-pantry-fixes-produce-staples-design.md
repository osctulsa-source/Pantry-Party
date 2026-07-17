# Pantry fixes + produce staples — design

**Date:** 2026-07-17
**Status:** Approved by user (conversation), pending spec review

Three user-reported items from on-device QA: a layout overflow on Collections, a
Quick Add content gap (no fruits/vegetables), and a discoverability trap where
opening pantry search hides the Add button.

## 1. "Recipes within reach" chip overflow (bug fix)

**Where:** `apps/mobile/src/features/insights/CollectionsScreen.tsx`, the
`UndiscoveredSection` cook teaser (~line 359).

**Problem:** `cookChips` is `flexDirection: 'row'` with no wrap; each `rchip`
holds `"{title} (need {n})"`. Long recipe titles push chips past the screen
edge.

**Fix (style-only, no logic):**
- `cookChips`: add `flexWrap: 'wrap'`.
- `rchip`: add `flexShrink: 1`, `maxWidth: '100%'`.
- `rchipText`: render with `numberOfLines={1}` and `ellipsizeMode="tail"` so a
  single pathologically long title truncates instead of overflowing.

The placeholder `? · ? · ?` chips are short and unaffected.

## 2. Fruits & vegetables in Quick Add (feature)

**Where:** `apps/mobile/src/features/pantry/staples.ts`,
`apps/mobile/src/features/pantry/stapleArt.ts`,
`apps/mobile/src/components/brandGlyphs.pantry.tsx`.

Two new groups in `STAPLE_GROUPS`, inserted after "Canned & basics" (before
"Drinks"). All items use `category: 'produce'` (a real core category with its
own expiry default in `packages/core/src/schema.ts`); none are `noExpiry`.
Naming matches the existing singular style (grapes stays naturally plural).

**Fruits**

| Name | Location | Glyph |
|---|---|---|
| Apple | pantry | `apple` (existing core) |
| Banana | pantry | `banana` (new) |
| Lemon | pantry | `lemon` (existing core) |
| Orange | pantry | `orange` (new) |
| Grapes | fridge | `grapes` (existing core) |
| Strawberries | fridge | `strawberry` (new) |
| Avocado | pantry | `avocadohalf` (new — distinct name; Collections has its own separate `avocado` in `collectionIcons.tsx`, a different glyph family, but keep names unambiguous) |
| Lime | pantry | `lime` (new) |

**Vegetables**

| Name | Location | Glyph |
|---|---|---|
| Onion | pantry | `onion` (new) |
| Garlic | pantry | `garlic` (new) |
| Potato | pantry | `potato` (new) |
| Carrot | fridge | `carrot` (existing core) |
| Tomato | pantry | `tomato` (existing core) |
| Bell pepper | fridge | `pepper` (existing core) |
| Broccoli | fridge | `broccoli` (new) |
| Lettuce | fridge | `lettuce` (new) |

**New glyphs (10):** banana, orange, strawberry, avocadohalf, lime, onion,
garlic, potato, broccoli, lettuce — added to `PANTRY_GLYPHS` /
`PantryFoodName` in `brandGlyphs.pantry.tsx`, same 48×48 two-tone loaf-mark
style (body + cut marks via the `Paint` contract), each with a `PANTRY_TONE`
entry chosen from the existing brand tone palette (e.g. banana/lime →
ochre/fern-family tones consistent with `FOOD_TONE` conventions).

**Ripple effects (all automatic, verify only):**
- Onboarding's staple picker shares `STAPLE_GROUPS` → new groups appear there
  (user chose this on purpose).
- The staple→glyph completeness test extends to the new names and fails CI if
  a mapping is missing.
- `stapleGlyph()` fallback to `jar` remains the dev-time safety net.
- `guideFor()` has produce entries with no seed brands; refine chevrons appear
  only where a kind guide exists — no work needed either way.

## 3. Keep Add reachable while searching (bug fix)

**Where:** `apps/mobile/src/features/pantry/PantryScreen.tsx`, the single
control band (~line 581).

**Problem:** The band renders exactly one of: bulk bar / search field / "Add
items" button. Opening search removes the Add button until the X is pressed.

**Fix:** Keep the one-band rule; the search band gains a compact `+` button
after the X:
- Same `Pressable` action as the Add button: `setAddMenuOpen(true)`.
- Accent-colored circle using `zoneTheme.accent` with `zoneTheme.onAccent`
  `Plus` icon, sized to the band height.
- `accessibilityRole="button"`, `accessibilityLabel="Add items to your
  pantry"`.
- Search state (open flag, query) is untouched by opening the add menu.

Bulk-select mode is unchanged.

## Testing

- **Unit:** staple-glyph completeness test covers the 16 new staples (existing
  test, no new file expected); run the apps/mobile Jest suite.
- **Typecheck:** `tsc` from `apps/mobile` (root typecheck is known-broken).
- **On-device/simulator:** Collections teaser with a long recipe title wraps;
  Quick Add and onboarding show the two new groups with correct glyphs;
  pantry search open → `+` opens the add menu without closing search.

## Out of scope

- No changes to the Collections `collectionIcons.tsx` glyph family.
- No new refine guides for produce.
- No changes to search behavior itself (focus, filtering, zones).
