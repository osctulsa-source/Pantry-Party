# OFF Category Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barcode scans use Open Food Facts' `categories_tags` to give every resolvable product a real app category, driving browse zone, storage-location default, and expiry default.

**Architecture:** A pure `categoryFromOffTags` mapper in `@breadbox/core` (ordered keyword rules over locale-stripped tag slugs, preservation intents before broad food words). The OFF client fetches `categories_tags` and resolves `OffProduct.category` at parse time. The scan flow threads that category through the basket rows and both insert paths, feeding the category-aware overloads that `suggestStorageLocation` / `suggestExpiryISO` / `addOrMergePantryItem` already have.

**Tech Stack:** TypeScript, vitest (packages/core), React Native/Expo scan flow.

**Spec:** `docs/superpowers/specs/2026-07-17-off-category-mapping-design.md`

**Working branch:** `feat/off-category-mapping` (already created; spec committed).

**Commands:**
- Core tests: `npm test` from `packages/core/` (vitest; filter: `npm test -- offCategory`).
- Mobile tests: `npm test` from `apps/mobile/` (jest).
- Typecheck: `npx tsc --noEmit` from `apps/mobile/` (root typecheck is known-broken).
- Lint (gates CI): `npm run lint` from repo root.

---

### Task 1: `categoryFromOffTags` (core, TDD)

**Files:**
- Create: `packages/core/src/offCategory.ts`
- Create: `packages/core/src/offCategory.test.ts`
- Modify: `packages/core/src/index.ts` (add star export)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/offCategory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { categoryFromOffTags } from './offCategory';
import { DEFAULT_SHELF_LIFE } from './schema';

describe('categoryFromOffTags', () => {
  it('maps a branded soda (the Diet Pepsi case)', () => {
    expect(categoryFromOffTags(['en:beverages', 'en:carbonated-drinks', 'en:sodas'])).toBe('beverage');
  });

  it('preservation outranks the food word (canned corn is pantry, not produce)', () => {
    expect(categoryFromOffTags(['en:canned-foods', 'en:vegetables', 'en:canned-vegetables'])).toBe('pantry');
    expect(categoryFromOffTags(['en:dried-fruits', 'en:fruits'])).toBe('pantry');
  });

  it('frozen outranks everything', () => {
    expect(categoryFromOffTags(['en:frozen-foods', 'en:pizzas'])).toBe('frozen');
    expect(categoryFromOffTags(['en:frozen-foods', 'en:vegetables'])).toBe('frozen');
  });

  it('maps dairy, meat, bakery, produce', () => {
    expect(categoryFromOffTags(['en:dairies', 'en:fermented-foods', 'en:yogurts'])).toBe('dairy');
    expect(categoryFromOffTags(['en:meats', 'en:poultry', 'en:chicken-breasts'])).toBe('meat');
    expect(categoryFromOffTags(['en:breads', 'en:sourdough-breads'])).toBe('bakery');
    expect(categoryFromOffTags(['en:plant-based-foods', 'en:fruits', 'en:fresh-fruits', 'en:bananas'])).toBe('produce');
  });

  it('matches compound slugs on boundaries (carbonated-waters, fruit-juices)', () => {
    expect(categoryFromOffTags(['en:carbonated-waters'])).toBe('beverage');
    expect(categoryFromOffTags(['en:fruit-juices'])).toBe('beverage');
  });

  it('locale prefixes other than en: still work, and missing prefixes are fine', () => {
    expect(categoryFromOffTags(['fr:boissons', 'en:sodas'])).toBe('beverage');
    expect(categoryFromOffTags(['sodas'])).toBe('beverage');
  });

  it('returns null with no confident match (no guessing)', () => {
    expect(categoryFromOffTags([])).toBeNull();
    expect(categoryFromOffTags(['en:plant-based-foods'])).toBeNull();
    expect(categoryFromOffTags(['en:open-beauty-facts'])).toBeNull();
  });

  it('only ever returns known app categories', () => {
    const known = new Set(Object.keys(DEFAULT_SHELF_LIFE));
    const samples: string[][] = [
      ['en:beverages'], ['en:canned-foods'], ['en:dairies'], ['en:meats'],
      ['en:breads'], ['en:frozen-foods'], ['en:vegetables'], ['en:snacks'],
      ['en:condiments'], ['en:groceries'], ['en:mystery-tag'],
    ];
    for (const tags of samples) {
      const cat = categoryFromOffTags(tags);
      if (cat !== null) expect(known).toContain(cat);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `packages/core/`): `npm test -- offCategory`
Expected: FAIL — cannot resolve `./offCategory`.

- [ ] **Step 3: Implement the mapper**

Create `packages/core/src/offCategory.ts`:

```ts
/**
 * Open Food Facts categories_tags → app category (DEFAULT_SHELF_LIFE keys).
 *
 * OFF tags are locale-prefixed slugs ("en:carbonated-drinks"). We strip the
 * prefix and run ordered keyword rules over ALL of a product's tags — first
 * rule with any hit wins. Ordering mirrors NAME_CATEGORY_RULES' philosophy:
 * preservation/processing intents (frozen, canned, dried) outrank the food
 * word, so canned corn stays pantry and frozen vegetables stay frozen.
 * Returns null rather than guessing; callers fall back to name inference.
 */

const OFF_CATEGORY_RULES: Array<[keywords: string[], category: string]> = [
  [['frozen-foods', 'ice-creams'], 'frozen'],
  [['canned-foods', 'dried-products', 'dried-fruits', 'pickled', 'preserves', 'jams'], 'pantry'],
  [['dairies', 'cheeses', 'yogurts', 'milks', 'butters', 'creams', 'fermented-milk-products'], 'dairy'],
  [['meats', 'poultry', 'seafood', 'fishes', 'charcuterie', 'meals-with-meat'], 'meat'],
  [['breads', 'pastries', 'viennoiseries', 'cakes', 'biscuits-and-cakes'], 'bakery'],
  [
    ['beverages', 'waters', 'sodas', 'juices', 'fruit-based-beverages', 'coffees', 'teas', 'energy-drinks', 'alcoholic-beverages', 'boissons'],
    'beverage',
  ],
  [['fruits', 'vegetables', 'fresh-fruits', 'fresh-vegetables'], 'produce'],
  [
    ['condiments', 'sauces', 'cereals-and-potatoes', 'pastas', 'snacks', 'sweet-snacks', 'salty-snacks', 'spreads', 'groceries'],
    'pantry',
  ],
];

/** keyword matches a slug exactly or as a hyphen-bounded segment run. */
function slugMatches(slug: string, keyword: string): boolean {
  return (
    slug === keyword ||
    slug.startsWith(`${keyword}-`) ||
    slug.endsWith(`-${keyword}`) ||
    slug.includes(`-${keyword}-`)
  );
}

export function categoryFromOffTags(tags: readonly string[]): string | null {
  const slugs = tags.map((t) => t.slice(t.indexOf(':') + 1).toLowerCase());
  for (const [keywords, category] of OFF_CATEGORY_RULES) {
    if (slugs.some((slug) => keywords.some((k) => slugMatches(slug, k)))) return category;
  }
  return null;
}
```

Note on `'boissons'`: the fr: beverage slug appears in the test; keeping the one
non-English slug that OFF commonly returns for co-branded EU products is cheap.
(`t.indexOf(':') + 1` is 0 when there is no colon — the whole tag is the slug.)

- [ ] **Step 4: Add the export**

In `packages/core/src/index.ts`, after the `pantryZones` line (grouping with the other classification modules):

```ts
export * from "./offCategory.ts";
```

- [ ] **Step 5: Run to verify pass, then the whole core suite**

Run (from `packages/core/`): `npm test -- offCategory` → PASS (8 tests).
Run (from `packages/core/`): `npm test` → all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/offCategory.ts packages/core/src/offCategory.test.ts packages/core/src/index.ts
git commit -m "feat(core): map Open Food Facts categories_tags to app categories"
```

---

### Task 2: OFF lookup carries the category

**Files:**
- Modify: `apps/mobile/src/data/openFoodFacts.ts`

No new unit test (network I/O module; error paths already collapse to null and are unchanged). Typecheck + Task 3's flow QA cover it.

- [ ] **Step 1: Fetch and resolve the category**

Apply these edits to `apps/mobile/src/data/openFoodFacts.ts`:

Add the import at the top:

```ts
import { categoryFromOffTags } from '@breadbox/core';
```

Extend the interface:

```ts
export interface OffProduct {
  name: string | null;
  brand: string | null;
  /** OFF's free-text package size ("500 g", "12 ct") — display only in v1. */
  quantityText: string | null;
  imageUrl: string | null;
  /** App category resolved from OFF categories_tags; null when unmapped. */
  category: string | null;
}
```

Extend the fields list:

```ts
const FIELDS = 'product_name,brands,quantity,image_front_small_url,categories_tags';
```

Extend the response type and the return value:

```ts
    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        quantity?: string;
        image_front_small_url?: string;
        categories_tags?: string[];
      };
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    // OFF brands is comma-separated; first entry is the primary.
    const brand = p.brands ? (p.brands.split(',')[0] ?? '').trim() || null : null;
    return {
      name: p.product_name?.trim() || null,
      brand,
      quantityText: p.quantity?.trim() || null,
      imageUrl: p.image_front_small_url ?? null,
      category: categoryFromOffTags(p.categories_tags ?? []),
    };
```

- [ ] **Step 2: Typecheck (expect failure in ScanScreen)**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: FAIL — `handleRetailBarcode`'s household-merge object literal is missing the new `category` property. That error is Task 3's work; if it does NOT appear, stop and re-check that `OffProduct` gained the required (non-optional) `category` field.

- [ ] **Step 3: Commit** (red typecheck is expected mid-feature; commit lands with Task 3 instead)

Do not commit yet — Task 3 completes the compile unit. Proceed directly.

---

### Task 3: Thread category through the scan flow

**Files:**
- Modify: `apps/mobile/src/features/capture/ScanReviewSheet.tsx` (`ScanBasketItem`, ~line 30)
- Modify: `apps/mobile/src/features/capture/ScanScreen.tsx` (`handleRetailBarcode` ~line 208, `pushNamesToBasket` ~line 181, `confirmAdd` ~line 341, `onAddAll` ~line 393)

- [ ] **Step 1: Extend `ScanBasketItem`**

In `apps/mobile/src/features/capture/ScanReviewSheet.tsx`:

```ts
export interface ScanBasketItem {
  /** Stable row key (barcode + capture time). */
  key: string;
  barcode: string;
  /** '' when Open Food Facts had no name — the row needs naming before it adds. */
  name: string;
  brand: string | null;
  /** OFF free-text size ("500 g") — display only. */
  sizeText: string | null;
  imageUrl: string | null;
  /** App category from OFF categories_tags; null for OCR/QR rows and OFF misses. */
  category: string | null;
  qty: number;
}
```

- [ ] **Step 2: Carry the category in `handleRetailBarcode`**

The household-memory merge keeps OFF's category (memory stores name/brand corrections only):

```ts
    const product: OffProduct | null = household
      ? {
          name: household.name,
          brand: household.brand,
          quantityText: off?.quantityText ?? null,
          imageUrl: off?.imageUrl ?? null,
          category: off?.category ?? null,
        }
      : off;
```

And the basket row literal (in the same function's `setBasket`) gains:

```ts
          category: product?.category ?? null,
```

(placed next to `imageUrl` in the new-row object.)

- [ ] **Step 3: OCR/QR rows carry null**

In `pushNamesToBasket`'s row literal, add next to `imageUrl: null`:

```ts
            category: null,
```

- [ ] **Step 4: Use the category in `confirmAdd`**

Replace the location/insert block:

```ts
      // Infer where the food naturally lives, then estimate expiry AT that
      // location — storing milk as "pantry" while estimating with a fridge
      // duration is how scanned items used to get wildly wrong dates.
      // OFF's category (when the barcode resolved) sharpens both guesses.
      const category = (phase.product?.category ?? undefined);
      const location = suggestStorageLocation(trimmed, category) ?? 'pantry';
      await addOrMergePantryItem({
        householdId: activeHouseholdId,
        userId,
        name: trimmed,
        brand: brand.trim() || null,
        barcode: isRetailBarcode(phase.barcode) ? phase.barcode : null,
        quantity: 1,
        category: category ?? null,
        location,
        expiresIso: suggestExpiryISO({ name: trimmed, category, location }),
        source: target === 'qr' ? 'manual' : 'barcode',
      });
```

(`addPantryItem`'s chain is `input.category ?? categorizeByName(name) ?? null`, so passing null preserves today's inference exactly.)

- [ ] **Step 5: Use the category in `onAddAll`**

Replace the per-row block inside the loop:

```ts
      for (const b of addable) {
        const nm = b.name.trim();
        // Same location-consistent estimate as the single-item confirm path;
        // OFF's category (when present) sharpens location + expiry.
        const category = b.category ?? undefined;
        const location = suggestStorageLocation(nm, category) ?? 'pantry';
        await addOrMergePantryItem({
          householdId: activeHouseholdId,
          userId,
          name: nm,
          brand: b.brand?.trim() || null,
          barcode: isRetailBarcode(b.barcode) ? b.barcode : null,
          quantity: b.qty,
          category: category ?? null,
          location,
          expiresIso: suggestExpiryISO({ name: nm, category, location }),
          source: basketSource(b.barcode),
        });
      }
```

- [ ] **Step 6: Typecheck + full mobile suite**

Run (from `apps/mobile/`): `npx tsc --noEmit && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 7: Commit (Tasks 2+3 together — one compile unit)**

```bash
git add apps/mobile/src/data/openFoodFacts.ts apps/mobile/src/features/capture/ScanReviewSheet.tsx apps/mobile/src/features/capture/ScanScreen.tsx
git commit -m "feat(capture): scanned items inherit Open Food Facts category"
```

---

### Task 4: Full verification

- [ ] **Step 1: Core suite** — Run (from `packages/core/`): `npm test` → all PASS.
- [ ] **Step 2: Mobile suite** — Run (from `apps/mobile/`): `npm test` → all PASS.
- [ ] **Step 3: Typecheck** — Run (from `apps/mobile/`): `npx tsc --noEmit` → clean.
- [ ] **Step 4: Lint** — Run (from repo root): `npm run lint` → 0 errors; none in touched files.
- [ ] **Step 5: On-device QA**
  - Scan a branded soda → lands in Drinks with a ~90-day expiry default.
  - Scan a dairy or frozen product → correct zone + sensible date.
  - Scan a barcode OFF doesn't know → unchanged manual-name flow (no category, name inference at insert).
  - Re-scan a household-corrected barcode → corrected name/brand persists AND the OFF category still applies.
- [ ] **Step 6: Hand off** — branch `feat/off-category-mapping`; PR after user QA.
