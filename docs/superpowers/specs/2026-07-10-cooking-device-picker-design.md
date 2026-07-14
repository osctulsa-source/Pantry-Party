# "Cooking With" Device Picker on the Cook Tab — Design

**Date:** 2026-07-10
**Status:** Approved
**Branch:** follow-on to `feat/shelf-life-db` work (client-side only; no API changes)

## Problem

The Cook tab suggests recipes by pantry match, learned taste, mealtime, and
expiry urgency — but never asks the one question a cook actually starts with:
"what am I cooking ON tonight?" A crockpot night and a grill night want very
different suggestions, and the data to tell them apart already exists (recipe
titles plus the per-step `equipment` arrays carried by both curated recipes
and Spoonacular responses).

## Decisions (user-confirmed)

- **Interaction:** prompt + chip row — first Cook-tab visit of the day shows a
  "What are you cooking with tonight?" card; the answer then lives as a
  persistent, editable chip row under the meal chips.
- **Effect:** **soft ranking boost** — matching recipes float up; nothing is
  hidden.
- **Devices:** 10 devices, **multi-select**, lazy-first order — Crockpot,
  Instant Pot, Air fryer, Sheet pan, Microwave, No-cook, Stove/pan, Oven,
  Grill, Griddle — plus an "Anything" reset.
- **Detection:** client-side keyword match against title + equipment strings.
  No Spoonacular search-parameter changes (option kept as a follow-up if
  niche-device nights feel starved).

## Design

### 1. Core module: `packages/core/src/cookingDevice.ts`

Pure functions, no I/O — same pattern as `useItUp.ts` / `mealtime.ts`.

```ts
export type CookingDevice =
  | 'stove' | 'oven' | 'crockpot' | 'airfryer' | 'grill' | 'griddle';

/** Ordered metadata for UI + detection. */
export const COOKING_DEVICES: Array<{
  id: CookingDevice;
  label: string;      // "Stove / pan", "Air fryer", …
  keywords: string[]; // lowercase phrases matched against title + equipment
}>;

/** Devices a recipe evidently uses, from its title + per-step equipment. */
export function detectDevices(
  title: string,
  equipment: string[],
): Set<CookingDevice>;

/** Flat boost when any selected device is detected; 0 otherwise. */
export function scoreDeviceBoost(
  selected: CookingDevice[],
  detected: Set<CookingDevice>,
): number;

/** Card badge, e.g. "Air fryer pick" — null when no selected device matched. */
export function formatDeviceBadge(
  selected: CookingDevice[],
  detected: Set<CookingDevice>,
): string | null;
```

- **Keyword dictionary** (initial; lowercase substring match against the
  lowercased title and each equipment string):
  - stove: `skillet`, `saucepan`, `sauté pan`, `frying pan`, `stovetop`,
    `stove`, `dutch oven`, `wok`, `pan-fried`, `pan-seared`
  - oven: `oven` (excluding `dutch oven`), `baking sheet`, `sheet pan`,
    `baking dish`, `roasting pan`, `casserole dish`, `baked`, `roasted`
  - crockpot: `slow cooker`, `crock pot`, `crockpot`, `slow-cooked`,
    `slow-cooker`
  - airfryer: `air fryer`, `air-fryer`, `air fried`, `air-fried`
  - grill: `grill` (excluding `grill pan`, which counts as stove), `grilled`,
    `barbecue`, `bbq`
  - griddle: `griddle`, `flat top`, `flat-top`, `plancha`
  - Word-boundary care: match as phrases within the string; the two listed
    exclusions (`dutch oven` → stove not oven, `grill pan` → stove not grill)
    are handled explicitly.
- **Boost:** `scoreDeviceBoost` returns **+5** when `selected` is non-empty
  and intersects `detected`, else **0**. Flat (not per-device) and sized to
  sit beside the use-it-up cap of 6 without drowning taste prefs. No penalty
  for non-matches — soft boost by design.
- **Badge:** names the first selected device that matched, using its label:
  `"Air fryer pick"`, `"Crockpot pick"`. One device only, no "+1 more" —
  it's a yes/no explainer, not a list.

### 2. Tonight's choice persistence: `useTonightDevices` hook

`apps/mobile/src/features/recipes/useTonightDevices.ts`, mirroring
`useRecipePrefs`:

- AsyncStorage key `cookingWith:<householdId>:<YYYY-MM-DD>` (local date), so
  the choice **expires naturally at midnight** and the prompt re-appears next
  day. No cleanup job; stale keys are tiny and overwritten per-day. On load,
  best-effort delete of the previous day's key keeps storage tidy.
- Stored value: `{ devices: CookingDevice[]; answered: true }`. "Anything" /
  dismiss stores `{ devices: [], answered: true }` — that's what suppresses
  re-prompting for the rest of the day.
- Exposes `{ devices, answered, setDevices, dismiss }`. `null` householdId →
  inert (empty, unanswered, setters no-op), same convention as
  `useRecipePrefs`.

### 3. Cook tab UI (`apps/mobile/src/features/recipes/RecipesScreen.tsx`)

1. **Prompt card** — rendered above the hero when `answered` is false and
   recipes have loaded. Copy: "What are you cooking with tonight?" with the
   time-of-day word from the existing mealtime helper ("this morning" /
   "today" / "tonight"). Chips for the 6 devices (multi-select toggles), an
   "Anything goes" chip, and an X dismiss. Confirm-on-tap: picking chips and
   tapping "Show me recipes" (or the X / "Anything goes") sets `answered`.
2. **Collapsed chip row** — once answered, a horizontal "Cooking with" chip
   row renders under the meal chips: the 6 devices plus "Any" (clears all).
   Toggling updates `useTonightDevices` and re-ranks instantly — scoring is
   client-side over already-fetched results; **no refetch**, no change to the
   fetch signature/pagination path.
3. **Ranking** — one added term in the existing blend:
   `+ scoreDeviceBoost(selectedDevices, detectedByRecipe.get(r.id))`.
   Detection per recipe is memoized from the loaded recipe list (title +
   flattened step equipment).
4. **Card badge** — hero card and alternate rows show `formatDeviceBadge`
   when non-null, styled like the use-it-up badge (neutral/success tone, not
   the expiry warning color) and stacking beneath it when both apply.

### 4. Edge cases

- No selection / "Anything": boost is 0 everywhere; ranking identical to
  today; no badges.
- Recipe with no detectable device: no boost, no badge, never penalized.
- Older cached Spoonacular responses with empty `equipment` arrays: detection
  falls back to title keywords alone.
- Multi-select ("grill + stove"): a recipe matching either gets the same +5;
  badge names the first selected device that matched.

### 5. Testing

- `packages/core/src/cookingDevice.test.ts`: every device's keywords detect
  from title-only and equipment-only inputs; the `dutch oven` and `grill pan`
  exclusions; multi-device recipes; boost 0 for empty selection, +5 for any
  intersection (flat, not summed); badge label per device, null when no
  match, first-selected-match wins.
- Mobile: existing jest-expo suite stays green; prompt/chips/badge verified
  by running the app (pure-text render of tested core functions, matching the
  use-it-up precedent).

## Out of scope (YAGNI)

- No Spoonacular `equipment` search parameter (documented follow-up if
  needed).
- No household "devices we own" setting — tonight's pick only.
- No server/API/schema changes; entirely client-side.
- No learning from device picks (taste prefs already learn from titles).

## Addendum — Full Lazy Kitchen (2026-07-10)

Extended the device list and curated catalog so dump-and-go nights have a real
pool to boost:

- **Devices (10, lazy-first order):** crockpot, instantpot, airfryer, sheetpan,
  microwave, nocook, stove, oven, grill, griddle.
- **Keyword split:** `sheet pan` / `baking sheet` live on `sheetpan` only (no
  longer oven), so sheet-pan nights don't over-tag as oven.
- **Curated batch:** ids `9000151`–`9000183` (33 recipes) — 6 crockpot, 5 air
  fryer, 6 Instant Pot, 6 sheet pan, 5 microwave, 5 no-cook — authored to
  SPEC.md with detection keywords in title and/or step equipment.
- Soft `+5` boost unchanged; no hard filter; no remembered "devices I own".
