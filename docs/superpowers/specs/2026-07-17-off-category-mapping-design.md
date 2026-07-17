# OFF category mapping for barcode scans — design

**Date:** 2026-07-17
**Status:** Approved by user (conversation), pending spec review

Scanned products currently get their category only from name-keyword inference
(`categorizeByName`), which misses anything without a generic food word in its
name. PR #189 patched the drinks case with brand keywords; this is the
systemic follow-up: use Open Food Facts' own `categories_tags` during barcode
lookup so every resolvable scan gets a real category — driving the browse
zone, storage-location default, and expiry default.

## Approach

Fetch `categories_tags` in the existing client-direct OFF lookup and map the
tags to an app category with a pure core function. No server proxy (the OFF
module's header documents the ADR-008 stance; unchanged). Inline app-side
mapping was rejected — tag classification is pure logic that belongs in core
beside `categorizeByName` and its vitest suite.

## 1. Tag mapper (core)

**Where:** new `packages/core/src/offCategory.ts` + `offCategory.test.ts`;
re-export via the existing star-export pattern in `index.ts`.

`categoryFromOffTags(tags: readonly string[]): string | null` — pure.

OFF tags are slugs like `['en:beverages', 'en:carbonated-drinks',
'en:sodas']`. The mapper strips the locale prefix (`en:`, `fr:`…), then runs
ordered keyword rules over ALL tags (first rule with any matching tag wins —
specific/preservation intents before broad ones, the `NAME_CATEGORY_RULES`
philosophy):

1. **frozen:** `frozen-foods`, `ice-creams`
2. **pantry (preservation outranks the food word):** `canned-foods`,
   `dried-products`, `dried-fruits`, `pickled`, `preserves`, `jams`
3. **dairy:** `dairies`, `cheeses`, `yogurts`, `milks`, `butters`, `creams`,
   `fermented-milk-products`
4. **meat:** `meats`, `poultry`, `seafood`, `fishes`, `charcuterie`,
   `meals-with-meat`
5. **bakery:** `breads`, `pastries`, `viennoiseries`, `cakes`,
   `biscuits-and-cakes`
6. **beverage:** `beverages`, `waters`, `sodas`, `juices`,
   `fruit-based-beverages`, `coffees`, `teas`, `energy-drinks`,
   `alcoholic-beverages`
7. **produce:** `fruits`, `vegetables`, `fresh-fruits`, `fresh-vegetables`,
   `plant-based-foods` is NOT enough on its own (too broad) — only the
   explicit fruit/vegetable slugs count
8. **pantry (broad fallback for clear shelf goods):** `condiments`, `sauces`,
   `cereals-and-potatoes`, `pastas`, `snacks`, `sweet-snacks`,
   `salty-snacks`, `spreads`, `groceries`
9. Anything else → `null` (no guess; caller falls back to name inference).

Matching is substring-on-slug-boundaries against the whole tag list per rule
(a product tagged both `beverages` and `sodas` hits rule 6 once). Only values
from the app's category set (`DEFAULT_SHELF_LIFE` keys: produce, dairy, meat,
frozen, pantry, bakery, beverage) are ever returned.

**Tests (vitest):** Diet Pepsi-style tags → beverage; canned corn
(`canned-foods` + `vegetables`) → pantry; frozen pizza → frozen; yogurt →
dairy; fresh bananas → produce; unknown/empty/no-locale tags → null; returned
values ⊆ DEFAULT_SHELF_LIFE keys for a grab-bag of real tag arrays.

## 2. OFF lookup carries a category (mobile)

**Where:** `apps/mobile/src/data/openFoodFacts.ts`.

- Add `categories_tags` to `FIELDS`.
- `OffProduct` gains `category: string | null`, resolved at parse time via
  `categoryFromOffTags(product.categories_tags ?? [])` — consumers never see
  raw tags.
- Misses, timeouts, and OFF products without tags keep today's behavior
  (`category: null`).

## 3. Thread through the scan flow (mobile)

**Where:** `apps/mobile/src/features/capture/ScanScreen.tsx`,
`apps/mobile/src/features/capture/ScanReviewSheet.tsx`.

- `ScanBasketItem` gains `category: string | null`. Barcode rows carry the OFF
  category; OCR/QR-named rows carry null. The household-memory merge keeps
  OFF's category (memory stores name/brand corrections only).
- Both insert paths (single-item `confirmAdd`, basket `onAddAll`) use it:
  - `suggestStorageLocation(name, category ?? undefined)`
  - `suggestExpiryISO({ name, category: category ?? undefined, location })`
  - `addOrMergePantryItem({ …, category })`
- `addPantryItem`'s existing chain (`input.category ?? categorizeByName(name)`)
  is untouched; passing null keeps today's behavior exactly.

Read-time zoning is deliberately unchanged: `getPantryZone` still prefers live
name inference over the stored category (the stale-category defense), so
compounds like "Canned tomatoes" behave identically regardless of OFF tags.

## 4. Testing

- **Core:** `offCategory.test.ts` as above; existing suites stay green.
- **Mobile:** existing jest suites stay green (the OFF module's error paths
  already collapse to null; no new mobile unit tests — the fetch change is
  network I/O exercised on-device).
- **On-device QA:** scan a branded soda → Drinks zone + a real expiry
  default; scan a dairy/frozen product → correct zone + sensible date; scan a
  barcode OFF doesn't know → unchanged manual-name flow.

## Out of scope

- No server-side proxy or category persistence changes (schema already has
  `category`).
- No re-categorization of previously scanned rows beyond what read-time name
  inference already does.
- No UI to display or edit the category in the scan sheets.
