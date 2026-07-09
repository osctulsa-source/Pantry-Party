# Shelf-life database — design

**Date:** 2026-07-09 · **Arc:** item intelligence, batch 1 · **Status:** approved approach (A)

## Problem

Expiry auto-fill in Add Item guesses shelf life from 7 keyword regexes mapping to
7 category-wide defaults (`packages/core/src/shelfLife.ts` + `DEFAULT_SHELF_LIFE`).
"Chicken" and "bacon" both get `meat: 3 days`; the user's chosen storage location
(pantry / fridge / freezer) is ignored entirely, so frozen chicken is suggested a
3-day expiry. Expiry tracking is the app's core value prop — the guess should be
food-specific and location-aware.

## Decision (approach A of 3)

Bundle a compact, generated dataset in `@breadbox/core`, derived from the USDA
**FoodKeeper** dataset (public domain; 662 foods with per-location min/max
durations). Keep the lookup a pure core function. Rejected alternatives:
a PowerSync-synced table (infra churn for near-static data; OTA already ships JS
data updates in ~1 minute) and hand-curating from scratch (strictly worse
coverage than free public-domain data).

## Components

### 1. Data pipeline — `data/shelf-life/`

Mirrors the `data/recipes/` owned-data pattern:

- `foodkeeper-ingredients.csv`, `foodkeeper-categories.csv` — source snapshot
  (USDA FSIS FoodKeeper, public domain; obtained via the
  `jelera/food-shelflife-db` mirror because fsis.usda.gov blocks non-browser
  fetches). Committed so the build is reproducible offline.
- `README.md` — provenance + attribution + regeneration instructions.
- `build.mjs` — Node script (no deps) that emits
  `packages/core/src/shelfLifeData.generated.ts`.

Conversion rules (per food, per location ∈ {pantry, fridge, freezer}):

- Duration column preference: **DOP (date-of-purchase)** variant when present,
  else the plain variant. After-opening / after-thawing columns are ignored
  (v1 models unopened items from purchase date — matches how Add Item is used).
- Days = midpoint of (min, max) converted by metric (Days=1, Weeks=7,
  Months=30.4, Years=365), rounded to whole days, minimum 1.
- Rows with no usable duration in any location are dropped.
- Emitted record: `{ n: string; k: string[]; p?: number; f?: number; z?: number }`
  (name, keyword aliases from the Keywords column + Name_subtitle, pantry days,
  fridge days, freezer days). Generated file is marked `// GENERATED — do not
  edit; run node data/shelf-life/build.mjs` and stays under ~100 KB.
- The script validates its own output (≥400 records; every record has ≥1
  duration; all durations 1–3650 days) and exits non-zero on violation.

### 2. Core lookup — `packages/core/src/shelfLife.ts`

`suggestShelfLifeDays(opts)` and `suggestExpiryISO(opts)` gain an optional
`location?: string`. Resolution order:

1. **Food match** against the generated dataset via a lazily-built index:
   - normalize (lowercase, trim, collapse whitespace) the item name;
   - precedence: exact name/alias equality → longest alias whose tokens all
     appear in the name → single-token alias match. Ties break to the alias
     with more tokens, then the longer alias. (So "orange juice" resolves via
     the juice entry, never the orange entry — same guarantee the old regex
     ordering provided, now data-driven.)
2. **Location days** for the matched food: exact match when `location` is one of
   `pantry | fridge | freezer` and that food has a duration there; otherwise
   fall back through the food's available durations in order
   **fridge → pantry → freezer** (covers custom locations like "garage shelf"
   and foods missing the chosen location).
3. **No food match** → existing behavior, unchanged: explicit `category` or
   `categorizeByName(name)` → `DEFAULT_SHELF_LIFE` → else `null` (caller leaves
   expiry blank). The regex table and category defaults are kept as the
   fallback tier, not deleted.

Public API stays backward-compatible — existing callers compile and behave the
same until they pass `location`.

### 3. App integration — `AddItemScreen.tsx`

The suggestion memo adds `location` to its inputs:
`suggestShelfLifeDays({ name: trimmedName, location })`, recomputing when the
LocationPicker changes. Existing interaction semantics are preserved — the
suggestion only pre-fills; a manually-set date is never overwritten (current
behavior, verified during implementation).

## Data flow

```
FoodKeeper CSVs ──build.mjs──▶ shelfLifeData.generated.ts (committed)
                                        │ import
Add Item (name, location) ──▶ suggestShelfLifeDays ──▶ suggested expiry date
                                        │ miss
                              categorizeByName → DEFAULT_SHELF_LIFE → null
```

## Error handling

- Generator: hard-fails (non-zero exit, no file written) on schema drift in the
  CSVs or validation failure — a broken dataset can't land silently.
- Runtime: lookup is pure and total — any unexpected name/location input falls
  through to the category tier or `null`; no throws on the Add Item path.

## Testing

- `shelfLife.test.ts` extensions: metric→days conversion cases (via generated
  fixtures), match precedence ("orange juice" ≠ "orange"; multi-word beats
  single token), location awareness (chicken: fridge ≈ days, freezer ≈ months),
  fridge→pantry→freezer fallback, custom-location fallback, category-tier
  regression (every case that passes today still passes), null for gibberish.
- Generator validation is self-executing (see above) and runs in CI via the
  core test suite importing the generated module (type-checks + spot checks).

## Non-goals (this arc)

Freeze-it nudges, storage-tip UI copy, after-opening durations, any backend or
schema change, per-household custom shelf-life overrides, custom-location
intelligence.
