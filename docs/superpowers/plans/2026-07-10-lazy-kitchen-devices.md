# Full Lazy Kitchen — Devices + Curated Recipes

**Date:** 2026-07-10  
**Status:** Implemented  
**Spec addendum:** `docs/superpowers/specs/2026-07-10-cooking-device-picker-design.md`

## Goal

Give crockpot / Instant Pot / sheet-pan / microwave / no-cook nights a real
house-recipe pool, and put lazy appliances first in the Cook tab picker.

## Checklist

- [x] Extend `CookingDevice` + `COOKING_DEVICES` (instantpot, microwave, sheetpan, nocook); lazy-first order; sheet-pan vs oven keyword split
- [x] Extend `cookingDevice.test.ts` (new devices, badges, sheet-pan ≠ oven, pressure-cooker → instantpot)
- [x] Author 33 SPEC-compliant curated recipes (`9000151`–`9000183`)
- [x] Merge into `data/recipes/curated.recipes.json` + mobile bundle copy; `validate.mjs` PASS
- [x] Update `data/recipes/README.md` + `curatedSource.ts` counts
- [x] Spec addendum for extended lazy kitchen scope

## Out of scope (still)

- Spoonacular equipment search param
- Remembered devices-I-own defaults
- Hard filter / recipe images for the new batch
