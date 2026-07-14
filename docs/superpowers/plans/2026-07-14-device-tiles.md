# Cook-Device Tiles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Cook tab's "What are you cooking with tonight?" prompt card renders Direction-B BrandTiles backed by 10 new appliance glyphs (6 live devices + 4 forward-mapped for the in-flight lazy-kitchen branch).

**Architecture:** Glyphs join `brandGlyphs.pantry.tsx` (family 52 → 62; names equal `CookingDevice` ids). `deviceArt.ts` maps device id → glyph with a `deviceGlyph()` fallback helper (stapleGlyph pattern) and completeness/uniqueness tests. Only the prompt card's chip block in `RecipesScreen.tsx` becomes a tile grid; the answered-state chip row is untouched. Spec: `docs/superpowers/specs/2026-07-14-device-tiles-design.md`.

**Tech Stack:** react-native-svg glyphs, jest (`apps/mobile`). Worktree: `C:\Users\JCS\Pantry-Party-devices`, branch `feat/device-tiles` (off `68558a7`).

**Verification:** `cd apps/mobile && npx tsc --noEmit && npx jest`; root `npm run lint` (0 errors); core untouched (`npm test --workspace @breadbox/core` once, at the end). Never commit `package-lock.json` churn.

**Glyph rules:** 48×48 viewBox; solid `body` silhouette; 2–3 `cut` interior marks; exterior marks (handles, legs, steam) stroke with `body`; **no `leaf`** (appliances aren't botanical). Group wrapper supplies strokeWidth 3, round caps.

---

### Task 1: Ten appliance glyphs (family 52 → 62)

**Files:**
- Modify: `apps/mobile/src/components/brandGlyphs.pantry.tsx`

- [ ] **Step 1: Extend union, record, tones.** Union additions (after `shrimp`): `| 'stove' | 'oven' | 'crockpot' | 'airfryer' | 'grill' | 'griddle' | 'instantpot' | 'sheetpan' | 'microwave' | 'nocook'`

Append to `PANTRY_GLYPHS` (after shrimp):

```tsx
  // ---- appliances (cook-device tiles) — no leaf, ever ----------------------
  // Frying pan: top-down disc + long handle, sizzle ticks inside.
  stove: ({ body, cut }) => (
    <>
      <Circle cx={20} cy={28} r={10} fill={body} />
      <Path d="M29 24 L40 19" fill="none" stroke={body} />
      <Path d="M17 26 l2 -3 M23 26 l2 -3" fill="none" stroke={cut} />
    </>
  ),
  // Oven: portrait box, door window outline, handle bar.
  oven: ({ body, cut }) => (
    <>
      <Rect x={13} y={12} width={22} height={28} rx={3} fill={body} />
      <Rect x={17} y={22} width={14} height={12} rx={2} fill="none" stroke={cut} />
      <Path d="M17 17 h14" fill="none" stroke={cut} />
    </>
  ),
  // Crockpot: squat pot, domed lid + knob, side handles, rim seam.
  crockpot: ({ body, cut }) => (
    <>
      <Path d="M13 20 h22 v11 q0 9 -11 9 q-11 0 -11 -9 Z" fill={body} />
      <Path d="M15 20 q0 -5 9 -5 q9 0 9 5 Z" fill={body} />
      <Circle cx={24} cy={12.5} r={2} fill={body} />
      <Path d="M13 24 h-3 M35 24 h3" fill="none" stroke={body} />
      <Path d="M15 20 h18" fill="none" stroke={cut} />
    </>
  ),
  // Air fryer: tall rounded body, vent lines, drawer seam + handle slot.
  airfryer: ({ body, cut }) => (
    <>
      <Rect x={15} y={10} width={18} height={30} rx={6} fill={body} />
      <Path d="M20 15 h8" fill="none" stroke={cut} />
      <Path d="M15 26 h18" fill="none" stroke={cut} />
      <Path d="M20 32 h8" fill="none" stroke={cut} />
    </>
  ),
  // Kettle grill: dome + bowl, splayed legs, lid handle, vent dot.
  grill: ({ body, cut }) => (
    <>
      <Path d="M12 24 q0 -11 12 -11 q12 0 12 11 Z" fill={body} />
      <Path d="M12 26 h24 q0 9 -12 9 q-12 0 -12 -9 Z" fill={body} />
      <Path d="M24 13 v-3" fill="none" stroke={body} />
      <Path d="M18 34 l-4 7 M30 34 l4 7" fill="none" stroke={body} />
      <Circle cx={24} cy={19} r={1.5} fill={cut} />
    </>
  ),
  // Griddle: flat plate, side handle nubs, steam curls (exterior = body).
  griddle: ({ body, cut }) => (
    <>
      <Rect x={11} y={26} width={26} height={7} rx={3} fill={body} />
      <Path d="M11 29 h-3 M37 29 h3" fill="none" stroke={body} />
      <Path d="M19 22 q2 -3 0 -6 M27 22 q2 -3 0 -6" fill="none" stroke={body} />
      <Path d="M15 29.5 h18" fill="none" stroke={cut} />
    </>
  ),
  // Instant Pot: straight cylinder, flat lid, steam valve, side handles, panel.
  instantpot: ({ body, cut }) => (
    <>
      <Rect x={14} y={16} width={20} height={22} rx={3} fill={body} />
      <Rect x={13} y={12.5} width={22} height={5} rx={2} fill={body} />
      <Rect x={22.5} y={8.5} width={3} height={4} rx={1} fill={body} />
      <Path d="M14 22 h-3.5 M34 22 h3.5" fill="none" stroke={body} />
      <Circle cx={24} cy={28} r={3} fill="none" stroke={cut} />
      <Circle cx={24} cy={34} r={1.2} fill={cut} />
    </>
  ),
  // Sheet pan: rimmed tray, inner outline, two cookie dots.
  sheetpan: ({ body, cut }) => (
    <>
      <Rect x={10} y={20} width={28} height={14} rx={4} fill={body} />
      <Rect x={14} y={23} width={20} height={8} rx={2} fill="none" stroke={cut} />
      <Circle cx={20} cy={27} r={1.5} fill={cut} />
      <Circle cx={27} cy={27} r={1.5} fill={cut} />
    </>
  ),
  // Microwave: landscape box, window outline, door seam, button dot.
  microwave: ({ body, cut }) => (
    <>
      <Rect x={10} y={17} width={28} height={17} rx={3} fill={body} />
      <Rect x={14} y={21} width={13} height={9} rx={1.5} fill="none" stroke={cut} />
      <Path d="M30 21 v9" fill="none" stroke={cut} />
      <Circle cx={33.5} cy={24} r={1.2} fill={cut} />
    </>
  ),
  // No-cook: cutting board (corner hole) with a knife laid across.
  nocook: ({ body, cut }) => (
    <>
      <Rect x={12} y={18} width={20} height={22} rx={4} fill={body} />
      <Path d="M18 34 L32 20 l3 3 L21 37 Z" fill={body} />
      <Path d="M32 20 l4 -4" fill="none" stroke={body} />
      <Circle cx={16} cy={22} r={1.6} fill={cut} />
    </>
  ),
```

Append to `PANTRY_TONE`:

```ts
  stove: 'spruce', oven: 'cocoa', crockpot: 'brick', airfryer: 'plum', grill: 'fern',
  griddle: 'ochre', instantpot: 'blue', sheetpan: 'terracotta', microwave: 'blue', nocook: 'cocoa',
```

- [ ] **Step 2: Verify** — `cd apps/mobile && npx tsc --noEmit && npx jest src/components/brandGlyphs.test.ts` → silent; 2 tests pass (62 keys both sides).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/brandGlyphs.pantry.tsx
git commit -m "feat(brand): ten appliance glyphs for device tiles (family 62)"
```

---

### Task 2: `deviceArt.ts` + `deviceGlyph()` (TDD)

**Files:**
- Create: `apps/mobile/src/features/recipes/deviceArt.test.ts`
- Create: `apps/mobile/src/features/recipes/deviceArt.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { COOKING_DEVICES } from '@breadbox/core';

import { DEVICE_ART, deviceGlyph } from './deviceArt';

describe('deviceArt', () => {
  it('covers every cooking device', () => {
    for (const d of COOKING_DEVICES) {
      expect(DEVICE_ART[d.id]).toBeDefined();
    }
  });

  it('no two devices share a glyph', () => {
    const glyphs = Object.values(DEVICE_ART);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('falls back to spoon for unknown ids', () => {
    expect(deviceGlyph('hologram-oven')).toBe('spoon');
  });
});
```

- [ ] **Step 2: Run** — `cd apps/mobile && npx jest src/features/recipes/deviceArt.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `deviceArt.ts`:**

```ts
/**
 * deviceArt — cooking-device id → loaf-mark glyph for the Cook tab's device
 * tiles. Glyph names equal device ids today (the map is identity), but the
 * indirection matches stapleArt/dietArt and keeps the UI insulated. The four
 * ids beyond main's COOKING_DEVICES (instantpot/sheetpan/microwave/nocook)
 * are mapped ahead for the in-flight lazy-kitchen device expansion.
 */
import type { BrandFoodName } from '../../components/BrandIcon';

export const DEVICE_ART: Record<string, BrandFoodName> = {
  stove: 'stove',
  oven: 'oven',
  crockpot: 'crockpot',
  airfryer: 'airfryer',
  grill: 'grill',
  griddle: 'griddle',
  // Mapped ahead (ship with the in-flight lazy-kitchen work)
  instantpot: 'instantpot',
  sheetpan: 'sheetpan',
  microwave: 'microwave',
  nocook: 'nocook',
};

export function deviceGlyph(id: string): BrandFoodName {
  const glyph = DEVICE_ART[id];
  if (glyph === undefined && __DEV__) {
    console.warn(`deviceArt: no glyph for "${id}" — falling back to spoon`);
  }
  return glyph ?? 'spoon';
}
```

- [ ] **Step 4: Run** — 3 tests pass; `npx tsc --noEmit` silent.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/recipes/deviceArt.ts apps/mobile/src/features/recipes/deviceArt.test.ts
git commit -m "feat(recipes): deviceArt map + deviceGlyph fallback, tested"
```

---

### Task 3: Prompt card — chips → tile grid

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

- [ ] **Step 1: Swap the chip block.** Read the unanswered prompt card (`!tonight.answered`, around line 549+): inside `styles.deviceCard`, the `<View style={styles.deviceCardChips}>…</View>` block maps `COOKING_DEVICES` to chips. Replace ONLY that block with:

```tsx
          <View style={styles.deviceCardGrid}>
            {COOKING_DEVICES.map((d) => {
              const on = pendingDevices.includes(d.id);
              return (
                <View key={d.id} style={styles.deviceCell}>
                  <BrandTile
                    glyph={deviceGlyph(d.id)}
                    label={d.label}
                    selected={on}
                    onPress={() =>
                      setPendingDevices((prev) =>
                        prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                      )
                    }
                  />
                </View>
              );
            })}
          </View>
```

Add imports: `import { BrandTile } from '../../components/BrandTile';` and `import { deviceGlyph } from './deviceArt';` (match the file's import grouping).

Add styles (near the other deviceCard styles):

```ts
  deviceCardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginTop: tokens.space(3) },
  // 4 per row, grow capped at 25%; with 6 devices that's a 4-row + a left-aligned 2-row.
  deviceCell: { flexBasis: '23%', flexGrow: 1, maxWidth: '25%' },
```

Then check whether `styles.deviceCardChips` is still referenced anywhere (grep the file); if not, delete that style. Do NOT touch the answered-state "Cooking with" horizontal chip row, the card head/dismiss, or the actions row ("Anything goes" / "Show me recipes").

- [ ] **Step 2: Verify** — `cd apps/mobile && npx tsc --noEmit && npx jest`; root `npm run lint` (0 errors; warnings ok).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(cook): device prompt card renders BrandTile grid"
```

---

### Task 4: Gate, glyph sheet, push, PR

- [ ] **Step 1: Full gate**

```bash
npm run lint && (cd apps/mobile && npx tsc --noEmit && npx jest) && npm test --workspace @breadbox/core
```

Expected: lint 0 errors; tsc silent; mobile all pass (31 + 3 new); core 261.

- [ ] **Step 2: Glyph sheet (controller task)** — render the 10 appliance glyphs from source into the QA artifact; eyeball crockpot vs instantpot and oven vs microwave at 34px before pushing (spec §4).

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/device-tiles
gh pr create --base main --title "feat(cook): device tiles — 10 appliance glyphs + prompt-card grid" --body "Cook tab's 'what are you cooking with tonight?' prompt card renders Direction-B BrandTiles (spec: docs/superpowers/specs/2026-07-14-device-tiles-design.md). 10 appliance glyphs (6 live + instantpot/sheetpan/microwave/nocook mapped ahead for the lazy-kitchen expansion; family 62). deviceArt map + deviceGlyph fallback, tested. Answered-state chip row deliberately unchanged. cookingDevice.ts untouched.

On-device QA: prompt card tiles toggle + 'Show me recipes' persists; dismiss; answered chip row unchanged; device boosts/badges still apply; dark mode + VoiceOver.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review

- **Spec coverage:** §1 glyphs+tones (Task 1, all 10, no leaf), §2 deviceArt+helper+tests (Task 2, incl. spoon fallback), §3 card grid + untouched answered row + dead-style cleanup (Task 3), §4 gate + glyph sheet + QA list (Task 4).
- **Placeholders:** none — every code step shows complete code.
- **Type consistency:** glyph names in Task 1's union match Task 2's DEVICE_ART values and Task 3's `deviceGlyph(d.id)` usage; `BrandTile` props match its shipped signature (glyph/label/selected/onPress).
