# Device-variant recipe instructions — design

**Date:** 2026-07-16
**Status:** Approved

## Problem

The Cook tab's "what are you cooking with tonight?" picker (`packages/core/src/cookingDevice.ts`,
`useTonightDevices`) currently only boosts ranking (+5) and badges matching cards. The recipe
content itself never changes: a stovetop chili shows stovetop steps even when the user picked
crockpot. This feature makes curated recipes carry **full alternate instruction sets per cooking
device**, shown automatically based on tonight's pick, with an in-recipe switcher.

## Decisions (settled during brainstorming)

- **Depth:** full alternate instructions per device — not time/temp overlays or per-step swaps.
- **Scope:** curated recipes only (the 208 owned "Pantry Party Kitchen" recipes). Spoonacular
  recipes are external content and are completely unaffected.
- **UX:** auto-default to tonight's picked device, with an always-available in-recipe switcher.
- **Variant data:** a variant overrides instruction **steps** and **readyInMinutes** only. The
  ingredient list is shared with the base recipe; variant steps accommodate differences in prose
  ("add only half the broth"). This keeps pantry matching, "you have this" flags, Add missing,
  and Cooked-it decrementing untouched.
- **Coverage:** every sensible recipe×device pairing across all 208 recipes (est. 350–500
  variants), authored via the existing batch workflow, shippable in waves.
- **Data approach:** sidecar variants file (base `curated.recipes.json` untouched).

## Data model

New authoring file `data/recipes/curated.variants.json` + mandatory bundle copy
`apps/mobile/src/data/curated/curated.variants.json` (same two-copy rule as the base dataset).
Flat JSON array:

```jsonc
{
  "recipeId": 9000123,        // must exist in curated.recipes.json
  "device": "crockpot",       // one of the 10 CookingDevice ids
  "readyInMinutes": 360,      // realistic total for THIS device
  "steps": [                  // identical step schema to base recipes
    { "number": 1, "step": "...", "ingredients": ["..."], "equipment": ["slow cooker"], "lengthMinutes": null }
  ]
}
```

### Validation (`data/recipes/validate.mjs --variants`)

- `(recipeId, device)` pairs unique; `recipeId` exists in the base file; `device` is a known
  `CookingDevice` id.
- Steps follow the base step schema: sequential `number` 1..N, 4–12 steps, every step
  `ingredients[]` name must match (or be contained in) a base-recipe ingredient name.
- `readyInMinutes` 5–600 (crockpot lows run long), roughly consistent with step `lengthMinutes`.
- Unknown device ids / dangling recipeIds are ERRORs — they cannot ship.

### Authoring spec

`data/recipes/SPEC-VARIANTS.md` — addendum to `SPEC.md`: same Pantry Party Kitchen voice
(original writing, doneness cues, novice-friendly), variant `equipment` strings name the device
naturally ("slow cooker", "air fryer basket") so keyword detection stays consistent as a bonus.
Variants must be genuinely good conversions, never forced.

## App behavior

### Variant lookup — `apps/mobile/src/data/curated/curatedVariants.ts`

Imports the bundled variants JSON, builds `Map<recipeId, DeviceVariant[]>` once at module load,
defensively dropping malformed entries. Exposes `getDeviceVariants(recipeId): DeviceVariant[]`
(empty for Spoonacular ids and unconverted curated recipes). Nothing else in the app knows where
variants live.

### Ranking & badges (Cook tab)

A recipe matches tonight's device if keyword detection (`detectDevices`) hits **or** a variant
exists for that device. `detectDevices` itself is unchanged; the curated search path supplies
variant device ids alongside detection results. Same +5 boost, same "Crockpot pick" badge — no
new badge vocabulary in v1.

### Recipe detail screen (`RecipeDetailScreen.tsx`)

- When `getDeviceVariants(id)` is non-empty, a chip row appears above Instructions:
  **Original · Crockpot · Instant Pot · …** — only devices that have variants, in
  `COOKING_DEVICES` display order, "Original" first.
- **Default selection:** first of tonight's picked devices (from `useTonightDevices`) that has a
  variant; otherwise Original.
- Switching chips swaps the rendered steps **and** the header time (variant `readyInMinutes`).
  Everything bound to ingredients (have/need split, Add missing, Cooked-it) stays on the shared
  base list.
- Selection is per-visit, not persisted; it re-defaults from tonight's pick on next open.

### Cook mode (`CookModeView.tsx`)

Receives whatever steps are active on the detail screen. No switcher inside cook mode.

### Explicitly out of scope for v1

- Recipe cards keep showing base `readyInMinutes` (revisit if the mismatch bothers people).
- No variant-specific ingredient overrides, images, or per-device badges.
- Spoonacular recipes: no switcher, original instructions, existing boost/badge behavior.

## Authoring sweep

1. **Coverage matrix** — one-time pass over all 208 recipes producing
   `data/recipes/variants-coverage.json`: per recipe × 10 devices, mark `native` / `convert` /
   `skip`. Reviewable before authoring starts; the checklist the batches burn down.
2. **Parallel batches** — `data/recipes/variants-batches/` files (~25 variants each), authored
   per `SPEC-VARIANTS.md`, each validated to PASS — the workflow that built the original 208.
3. **Merge** into `curated.variants.json`, sync the bundle copy, full-file validate.

## Error handling

Malformed variant entries are silently dropped at load (never crash the Cook tab). A recipe whose
variants all fail parsing shows no switcher. Data-level errors are caught by the validator before
merge.

## Testing

- **Validator fixtures:** bad recipeId, duplicate `(recipeId, device)`, mismatched step
  ingredient, unknown device — each must ERROR.
- **Unit (jest, apps/mobile):** `curatedVariants` lookup (malformed dropped, unknown id → empty);
  default-chip selection (tonight's device → variant, multi-select order, fallback to Original);
  extended device-match rule for ranking.
- **Verification gotchas:** typecheck via `apps/mobile` tsc (root typecheck broken); lint gates CI.
- **On-device QA:** pick crockpot tonight → open converted recipe → variant defaulted, header time
  changed, cook mode uses variant steps; Spoonacular recipe shows no switcher.

## Rollout

The UI is inert until data exists, so code can merge first and light up as batches land.
Coverage matrix → batches is naturally incremental; "every sensible pairing" ships in waves.
