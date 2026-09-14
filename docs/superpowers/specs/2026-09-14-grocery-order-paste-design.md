# Grocery order paste — design

**Date:** 2026-09-14
**Status:** Approved in conversation; pending user review of this file

Turn **Paste a list** into a grocery-order importer: paste a copied Instacart
delivered-order page (or a typed list), preview a checklist with quantities,
then add checked rows through the existing pantry merge path.

This is JS-only. No Instacart API, no email, no new native modules, no
`app.config.js` / plugin / OTA / TestFlight ship-path changes. Testers do not
see this until a later Mac-local production binary.

## Approach

A structured parser in `@breadbox/core` returns `{ name, quantity, unit }[]`.
`BulkPasteScreen` shows those rows as a checklist and writes with
`addOrMergePantryItem`. Do not extend `parseReceiptText` for this: that helper
returns names only and **strips** size tokens (`lb`, `oz`), which would drop
`2.4 lb` on produce. Screenshot OCR can call the new parser later; that is
out of scope for this plan.

Rejected: screen-only regex in `BulkPasteScreen`; a dedicated “Instacart”
entry point (hardcodes a partner; same paste + parser).

## 1. Parser (core)

**Where:** `packages/core/src/groceryPaste.ts` + `groceryPaste.test.ts`;
re-export from `packages/core/src/index.ts`.

```ts
export interface GroceryPasteItem {
  name: string;
  quantity: number;
  /** Canonical unit when the order sold by weight (e.g. `lb`); null for counts. */
  unit: string | null;
}

export interface GroceryPasteResult {
  items: GroceryPasteItem[];
  /** True when the blob looked like a priced order dump, not a typed list. */
  lookedLikeOrder: boolean;
}

export function parseGroceryPaste(raw: string, options?: { limit?: number }): GroceryPasteResult;
```

Default `limit` is 50 (same cap as today’s paste screen).

### Mode detection

Treat the paste as an **order dump** when any of these appear (case-insensitive):

- `Found (` (Instacart’s item count header)
- a `$` price (`$7.57`)
- `· each` (Instacart unit-price suffix; do **not** key off a bare word `each`)
- `/lb` next to a price (`$0.74/lb`)

Otherwise it is a **plain list**: split on newlines / commas / semicolons
(today’s `parseNames` rules), trim, drop empties, case-insensitive dedupe,
quantity `1`, unit `null`.

### Order-dump walk

Split on newlines. Classify each trimmed line:

| Kind | Examples from the 2026-09-14 fixture |
|---|---|
| Noise | `Found (9)`, `Your order was delivered`, `Delivery details`, `Family order`, `Receipt`, shopper names, `Weight decreased from…`, `~ …`, address lines |
| Price | `$7.57`, `$7.57 · each`, `$0.74/lb · 2.4 lb`, strikethrough sale remnants that are only money |
| Quantity | a lone `1`, or `2.4 lb` / `2.4lb` (number + optional unit from `UNITS`) |
| Product | anything left with at least 3 letters after stripping prices |

Walk top to bottom. A **product** line starts an item. Attach the **first
quantity line after it and before the next product**. If none, quantity `1`,
unit `null`. Ignore noise and price lines.

**Pack size in the title is not pantry quantity.**  
`All Natural* 80% Lean/20% Fat Ground Beef Chuck Tray, 1 lb` + following `1`
→ name keeps `1 lb`, pantry qty `1`, unit `null`.

**Sold-by-weight uses the quantity column.**  
`Organic Bananas` + following `2.4 lb` → name `Organic Bananas`, qty `2.4`,
unit `lb`. Do not also keep `/lb` price lines as items.

**Do not merge distinct products.** The two Lay’s flavors are two rows even
if both have qty `1`.

**Do not case-fold-dedupe order dumps** the way plain lists do — replacements
and near-duplicate titles can both be real. Cap at `limit` in encounter order.

Names: collapse whitespace; keep `&`, `'`, digits, `%`, `*`, commas as in the
title; strip leading/trailing junk. Do not title-case aggressively if the
source is already title case (Instacart is). Plain-list names keep current
trim/`slice(0, 100)` behavior; order-dump names respect `PantryItem.name`
max 120.

### Canonical fixture (must parse to nine items)

Reconstructed clipboard from the delivered-order screenshot (Found 9):

1. Diet Coke Soda — qty 1, unit null
2. All Natural\* 80% Lean/20% Fat Ground Beef Chuck Tray, 1 lb — qty 1, unit null
3. Similac 360 Total Care Infant Formula Powder With 5 HMO Prebiotics — qty 1, unit null
4. Hormel Hard Salami & Pepperoni Party Tray — qty 1, unit null
5. Great Value 2% Reduced Fat Milk — qty 1, unit null
6. Organic Bananas — qty 2.4, unit `lb`
7. Lay's Potato Chips Honey Barbecue — qty 1, unit null
8. Lay's Potato Chips, Salt & Vinegar Flavored — qty 1, unit null
9. Kellogg's Frosted Mini-Wheats Original Breakfast Cereal, 48g Whole Grain, Family Size — qty 1, unit null

The test file should include a multi-line blob with prices, `Found (9)`,
`· each`, `/lb`, and `Weight decreased from 2.49 lb` and assert this table.

## 2. Preview + write (mobile)

**Where:** `apps/mobile/src/features/capture/BulkPasteScreen.tsx` only for UI.
Writes stay on `addOrMergePantryItem` (no new insert shape).

- Hint: paste a grocery order or a typed list (one per line or commas). Do
  **not** hardcode Instacart in the UI.
- Placeholder can show a short typed list plus one priced line so the
  affordance is obvious.
- Under the text box, render one row per parsed item: checkbox (on by
  default), name, quantity (and unit when set).
- Primary button: `Add N items` where N is the **checked** count. Disabled
  when N is 0 or while busy.
- On submit, for each checked item (in list order):
  - `location = suggestStorageLocation(name) ?? 'pantry'`
  - `expiresIso = suggestExpiryISO({ name, location })`
  - `source: 'receipt'`
  - `addOrMergePantryItem({ …, quantity, unit })`
- Success: haptic + `goBack()`, same as today.
- Still cap at 50; show the existing “add the rest in a second pass” note
  when truncated.
- On successful submit only: `void track('paste_add', { parsed, kept, orderDump })`
  — counts only, same posture as `ocr_review` `{ parsed, kept }` on PR #245.
  `parsed` = rows the parser produced, `kept` = checked rows written,
  `orderDump` = `lookedLikeOrder`. No parse-failure event (empty pastes never
  reach submit). Add `paste_add` to the `AnalyticsEvent` union.

Empty parse (whitespace, or only chrome/prices): show an error, no write —
not a disabled button with no explanation.

Mid-batch throw: keep today’s message (`Some items may not have been added.`);
do not claim the whole batch succeeded.

Category: leave to `addPantryItem` (`categorizeByName`). No brand split;
the Instacart title is the name.

## 3. Testing

**Core (vitest, `groceryPaste.test.ts`):**

- The nine-item Instacart fixture above (noise + prices stripped; bananas
  2.4 lb; beef pack-size in name; two Lay’s rows).
- Plain list `Milk, Eggs` → two items qty 1 (regression for current paste).
- Newline-only typed list still works.
- Blob that is only `Found (9)` / prices / `Thank you` → `items: []`.
- `limit: 2` truncates an order dump to two products.
- Quantity line `2` after a name → qty 2, unit null.

**Mobile (`analytics.test.ts`):** `paste_add` props `{ parsed, kept, orderDump }`
survive the PostHog round trip (counts only).

**Mobile:** no new Detox/Maestro requirement. If `BulkPasteScreen` already
has a test file, cover checked-count → add; otherwise parser tests are the
gate and the screen change stays small enough for review.

## 4. TestFlight / ship

- Do not touch `app.config.js`, Expo plugins, `updates.enabled`,
  `.easignore`, or iOS scripts.
- Do not run `eas update` / `eas submit` from this work.
- JS change waits for a full Mac-local production IPA when we next ship;
  build 47 is unchanged until then.

## Out of scope

- Instacart account login, scraping, or Connect/retailer APIs
- Email forwarding
- Camera/screenshot OCR wired to this parser (reuse later; not this slice)
- Editing qty in the preview (uncheck or re-paste)
- Changing quantity-merge semantics (still sum-on-identical-row via
  `addOrMergePantryItem`; live schema stays LWW `updated_at`)
