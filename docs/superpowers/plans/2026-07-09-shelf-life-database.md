# Shelf-Life Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-regex shelf-life guess with a USDA-FoodKeeper-derived, location-aware dataset powering Add Item expiry auto-fill.

**Architecture:** A Node build script converts committed FoodKeeper CSVs into a generated TS module in `@breadbox/core`; a new pure lookup module matches item names against it (location-aware); `shelfLife.ts` tries the food tier first and keeps the existing category tier as fallback; `AddItemScreen` passes the picked location. Spec: `docs/superpowers/specs/2026-07-09-shelf-life-database-design.md`.

**Tech Stack:** Node 20 (`build.mjs`, zero deps), TypeScript in `packages/core` (vitest), React Native screen touch (jest).

**Branch:** `feat/shelf-life-db` (already created; spec committed).

---

### Task 1: Source data snapshot

**Files:**
- Create: `data/shelf-life/foodkeeper-ingredients.csv`
- Create: `data/shelf-life/foodkeeper-categories.csv`
- Create: `data/shelf-life/README.md`

- [ ] **Step 1: Download the CSV snapshots**

```sh
cd /c/Users/JCS/Pantry-Party
mkdir -p data/shelf-life
curl -sSL "https://raw.githubusercontent.com/jelera/food-shelflife-db/master/lib/seeds/ingredients.csv" -o data/shelf-life/foodkeeper-ingredients.csv
curl -sSL "https://raw.githubusercontent.com/jelera/food-shelflife-db/master/lib/seeds/categories.csv" -o data/shelf-life/foodkeeper-categories.csv
wc -l data/shelf-life/*.csv
```

Expected: `662` lines in ingredients (661 data rows + header), ~50 in categories. (Copies also exist in the session scratchpad as `foodkeeper-ingredients.csv` / `foodkeeper-categories.csv` if the mirror is unreachable.)

- [ ] **Step 2: Write the provenance README**

Create `data/shelf-life/README.md`:

```markdown
# Shelf-life source data (USDA FoodKeeper)

`foodkeeper-ingredients.csv` + `foodkeeper-categories.csv` are a snapshot of the
USDA FSIS **FoodKeeper** dataset (public domain, produced by USDA FSIS with
Cornell University and the Food Marketing Institute). fsis.usda.gov blocks
non-browser downloads, so the snapshot was taken from the
`jelera/food-shelflife-db` GitHub mirror (same data, CSV form) on 2026-07-09.

`build.mjs` converts the ingredients CSV into
`packages/core/src/shelfLifeData.generated.ts` — the compact dataset the app
bundles for location-aware expiry suggestions. Regenerate after editing the
CSVs or the script:

    node data/shelf-life/build.mjs

The script validates its output and exits non-zero on violations; the generated
file is committed. `foodkeeper-categories.csv` is provenance-only in v1 (the
generated records don't carry FoodKeeper categories).
```

- [ ] **Step 3: Commit**

```bash
git add data/shelf-life
git commit -m "data(shelf-life): snapshot USDA FoodKeeper CSVs (public domain) + provenance"
```

---

### Task 2: Generator — `build.mjs`

**Files:**
- Create: `data/shelf-life/build.mjs`
- Create (generated): `packages/core/src/shelfLifeData.generated.ts`

- [ ] **Step 1: Write the generator**

Create `data/shelf-life/build.mjs` (complete file):

```js
/**
 * FoodKeeper → shelfLifeData.generated.ts
 *
 * Reads the committed FoodKeeper ingredients CSV and emits the compact
 * dataset @breadbox/core bundles for shelf-life suggestions. Pure Node, no
 * deps. Validates its own output and exits non-zero on violation — a broken
 * dataset cannot land silently. See data/shelf-life/README.md.
 *
 * Per food + location (Pantry / Refrigerate / Freeze):
 *   - prefer the DOP_ (date-of-purchase) columns, else the plain columns
 *     (after-opening / after-thawing variants are ignored in v1);
 *   - days = round(midpoint(min, max) * metricFactor), clamped to >= 1;
 *   - usable metrics: Hours, Days, Weeks, Months, Year, Years — anything else
 *     ("Indefinitely", "When Ripe", "Package use-by date", "Not Recommended")
 *     means "no value for this location".
 * Rows with no usable duration anywhere are dropped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'foodkeeper-ingredients.csv');
const OUT = join(HERE, '..', '..', 'packages', 'core', 'src', 'shelfLifeData.generated.ts');

// --- minimal CSV parser (handles quoted fields with commas + doubled quotes) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const METRIC_DAYS = {
  Hours: 1 / 24, Days: 1, Weeks: 7, Months: 30.4, Year: 365, Years: 365,
};

function toDays(min, max, metric) {
  const factor = METRIC_DAYS[metric];
  if (!factor) return null;
  const lo = min === '' ? null : Number(min);
  const hi = max === '' ? null : Number(max);
  const a = lo ?? hi, b = hi ?? lo;
  if (a == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(1, Math.round(((a + b) / 2) * factor));
}

const raw = readFileSync(SRC, 'utf8').replace(/^﻿/, '');
const [header, ...dataRows] = parseCsv(raw).filter((r) => r.length > 1);
const col = Object.fromEntries(header.map((h, i) => [h, i]));

function locationDays(row, base) {
  // Prefer DOP_ columns, else plain.
  for (const prefix of [`DOP_${base}`, base]) {
    const d = toDays(
      row[col[`${prefix}_Min`]] ?? '',
      row[col[`${prefix}_Max`]] ?? '',
      (row[col[`${prefix}_Metric`]] ?? '').trim(),
    );
    if (d !== null) return d;
  }
  return null;
}

const records = [];
for (const row of dataRows) {
  const name = (row[col.Name] ?? '').trim().toLowerCase();
  if (!name) continue;
  const p = locationDays(row, 'Pantry');
  const f = locationDays(row, 'Refrigerate');
  const z = locationDays(row, 'Freeze');
  if (p === null && f === null && z === null) continue;
  const aliases = new Set([name]);
  for (const kw of (row[col.Keywords] ?? '').split(',')) {
    const k = kw.trim().toLowerCase();
    if (k) aliases.add(k);
  }
  const rec = { n: name, k: [...aliases] };
  if (p !== null) rec.p = p;
  if (f !== null) rec.f = f;
  if (z !== null) rec.z = z;
  records.push(rec);
}

// --- validation: hard-fail rather than emit a bad dataset ---
const fail = (msg) => { console.error(`VALIDATION FAILED: ${msg}`); process.exit(1); };
if (records.length < 400) fail(`only ${records.length} records (expected >= 400)`);
for (const r of records) {
  for (const key of ['p', 'f', 'z']) {
    if (r[key] !== undefined && (r[key] < 1 || r[key] > 3650)) {
      fail(`${r.n}: ${key}=${r[key]} out of 1..3650`);
    }
  }
  if (r.p === undefined && r.f === undefined && r.z === undefined) fail(`${r.n}: no durations`);
  if (!r.k.length) fail(`${r.n}: no aliases`);
}
const chicken = records.find((r) => r.n === 'chicken' && r.k.includes('whole'));
if (!chicken || !(chicken.f <= 3) || !(chicken.z >= 200)) {
  fail('spot check: whole chicken should be fridge <= 3 days, freezer >= 200 days');
}

const body = records.map((r) => JSON.stringify(r)).join(',\n  ');
writeFileSync(
  OUT,
  `// GENERATED by data/shelf-life/build.mjs — DO NOT EDIT.
// Source: USDA FoodKeeper (public domain); see data/shelf-life/README.md.
// Fields: n = name, k = aliases, p/f/z = pantry/fridge/freezer shelf life (days).

export interface ShelfLifeRecord {
  n: string;
  k: string[];
  p?: number;
  f?: number;
  z?: number;
}

export const SHELF_LIFE_DATA: readonly ShelfLifeRecord[] = [
  ${body},
];
`,
);
console.log(`wrote ${records.length} records -> ${OUT}`);
```

- [ ] **Step 2: Run it and spot-check the output**

```sh
node data/shelf-life/build.mjs
head -20 packages/core/src/shelfLifeData.generated.ts
grep -c '"n"' packages/core/src/shelfLifeData.generated.ts
grep '"chicken"' packages/core/src/shelfLifeData.generated.ts | head -3
```

Expected: `wrote 4xx-6xx records`, header comment present, chicken rows show small `f` and large `z`.

- [ ] **Step 3: Verify core still typechecks with the new module**

```sh
cd packages/core && npx tsc -p tsconfig.json --noEmit && cd ../..
```

Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add data/shelf-life/build.mjs packages/core/src/shelfLifeData.generated.ts
git commit -m "data(shelf-life): generator + generated dataset (FoodKeeper -> core)"
```

---

### Task 3: Dataset invariants test (locks the generated module's contract)

**Files:**
- Create: `packages/core/src/shelfLifeData.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/core/src/shelfLifeData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SHELF_LIFE_DATA } from './shelfLifeData.generated.ts';

describe('shelfLifeData.generated', () => {
  it('has broad coverage', () => {
    expect(SHELF_LIFE_DATA.length).toBeGreaterThanOrEqual(400);
  });

  it('every record has >=1 duration, all within 1..3650 days, and aliases', () => {
    for (const r of SHELF_LIFE_DATA) {
      const days = [r.p, r.f, r.z].filter((d): d is number => d !== undefined);
      expect(days.length, r.n).toBeGreaterThan(0);
      for (const d of days) {
        expect(d, r.n).toBeGreaterThanOrEqual(1);
        expect(d, r.n).toBeLessThanOrEqual(3650);
      }
      expect(r.k.length, r.n).toBeGreaterThan(0);
      expect(r.k, r.n).toContain(r.n);
    }
  });

  it('location-awareness exists in the data (fridge != freezer for whole chicken)', () => {
    const chicken = SHELF_LIFE_DATA.find((r) => r.n === 'chicken' && r.k.includes('whole'));
    expect(chicken).toBeDefined();
    expect(chicken!.f).toBeLessThanOrEqual(3);
    expect(chicken!.z).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run it**

```sh
cd packages/core && npx vitest run src/shelfLifeData.test.ts && cd ../..
```

Expected: 3 tests PASS (the generated file already exists from Task 2).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/shelfLifeData.test.ts
git commit -m "test(core): shelf-life dataset invariants"
```

---

### Task 4: Lookup module — matching + location resolution (TDD)

**Files:**
- Create: `packages/core/src/shelfLifeLookup.test.ts`
- Create: `packages/core/src/shelfLifeLookup.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/shelfLifeLookup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { daysForLocation, matchFood } from './shelfLifeLookup.ts';
import type { ShelfLifeRecord } from './shelfLifeData.generated.ts';

describe('matchFood', () => {
  it('matches an exact name', () => {
    expect(matchFood('butter')?.n).toBe('butter');
  });

  it('is case/punctuation-insensitive', () => {
    expect(matchFood('  BUTTER! ')?.n).toBe('butter');
  });

  it('prefers multi-token aliases over single tokens (orange juice != orange)', () => {
    const m = matchFood('orange juice');
    expect(m).not.toBeNull();
    // Must resolve via a juice-family entry, not fresh produce: juice keeps
    // for weeks+ in the pantry or fridge; an orange entry would be days.
    expect(m!.k.some((k) => k.includes('juice'))).toBe(true);
  });

  it('prefers the more specific chicken row for "deli chicken"', () => {
    const m = matchFood('deli chicken');
    expect(m).not.toBeNull();
    expect(m!.k).toContain('deli meat');
  });

  it('falls back to the generic row for bare "chicken"', () => {
    const m = matchFood('chicken');
    expect(m).not.toBeNull();
    expect(m!.n).toBe('chicken');
  });

  it('matches head nouns on later tokens ("fresh whole milk" -> milk)', () => {
    const m = matchFood('fresh whole milk');
    expect(m).not.toBeNull();
    expect(m!.k.some((k) => k.includes('milk'))).toBe(true);
  });

  it('returns null for gibberish', () => {
    expect(matchFood('zzqx flurbo')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchFood('')).toBeNull();
    expect(matchFood('   ')).toBeNull();
  });
});

describe('daysForLocation', () => {
  const rec: ShelfLifeRecord = { n: 'x', k: ['x'], p: 100, f: 5, z: 300 };

  it('uses the exact location when the record has it', () => {
    expect(daysForLocation(rec, 'pantry')).toBe(100);
    expect(daysForLocation(rec, 'fridge')).toBe(5);
    expect(daysForLocation(rec, 'freezer')).toBe(300);
  });

  it('falls back fridge -> pantry -> freezer when the location is missing on the record', () => {
    expect(daysForLocation({ n: 'x', k: ['x'], p: 100 }, 'fridge')).toBe(100);
    expect(daysForLocation({ n: 'x', k: ['x'], z: 300 }, 'pantry')).toBe(300);
  });

  it('treats custom/unknown locations with the same fallback order', () => {
    expect(daysForLocation(rec, 'garage shelf')).toBe(5);
    expect(daysForLocation(rec, undefined)).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```sh
cd packages/core && npx vitest run src/shelfLifeLookup.test.ts && cd ../..
```

Expected: FAIL — `Cannot find module './shelfLifeLookup.ts'`.

- [ ] **Step 3: Implement the module**

Create `packages/core/src/shelfLifeLookup.ts`:

```ts
/**
 * Data-driven shelf-life lookup — the food tier of suggestShelfLifeDays.
 * Pure + total: bad input falls through to null, never throws.
 *
 * Matching precedence (per spec): exact normalized name/alias, then the alias
 * with the most tokens all present in the item name, then single-token hits.
 * Ties break to (a) the later token position in the name — the head noun of an
 * English food name comes last ("orange juice" is a juice) — then (b) the
 * record with fewer aliases (more generic row wins for bare names like
 * "chicken", where whole-bird beats deli-sliced).
 */
import { SHELF_LIFE_DATA, type ShelfLifeRecord } from './shelfLifeData.generated.ts';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface IndexEntry {
  rec: ShelfLifeRecord;
  alias: string;
  tokens: string[];
}

let INDEX: IndexEntry[] | null = null;

function index(): IndexEntry[] {
  if (!INDEX) {
    INDEX = [];
    for (const rec of SHELF_LIFE_DATA) {
      for (const alias of rec.k) {
        const norm = normalize(alias);
        if (norm) INDEX.push({ rec, alias: norm, tokens: norm.split(' ') });
      }
    }
  }
  return INDEX;
}

/** Best matching food record for a free-text item name, or null. */
export function matchFood(name: string): ShelfLifeRecord | null {
  const norm = normalize(name);
  if (!norm) return null;
  const nameTokens = norm.split(' ');
  const tokenPos = new Map<string, number>();
  nameTokens.forEach((t, i) => tokenPos.set(t, i));

  let best: { score: number[]; rec: ShelfLifeRecord } | null = null;
  for (const entry of index()) {
    let lastPos = -1;
    let allPresent = true;
    for (const t of entry.tokens) {
      const pos = tokenPos.get(t);
      if (pos === undefined) {
        allPresent = false;
        break;
      }
      if (pos > lastPos) lastPos = pos;
    }
    if (!allPresent) continue;
    const score = [
      entry.alias === norm ? 1 : 0, // exact beats everything
      entry.tokens.length, //          more matched tokens
      lastPos, //                      later (head-noun) position
      -entry.rec.k.length, //          more generic record
    ];
    if (!best || compareScores(score, best.score) > 0) {
      best = { score, rec: entry.rec };
    }
  }
  return best?.rec ?? null;
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

const FALLBACK_ORDER: Array<keyof Pick<ShelfLifeRecord, 'f' | 'p' | 'z'>> = ['f', 'p', 'z'];
const LOCATION_FIELD: Record<string, 'p' | 'f' | 'z'> = {
  pantry: 'p',
  fridge: 'f',
  freezer: 'z',
};

/**
 * Days for a record at a storage location. Built-in locations use their own
 * duration when present; otherwise (and for custom locations / no location)
 * fall back fridge -> pantry -> freezer.
 */
export function daysForLocation(rec: ShelfLifeRecord, location?: string): number | null {
  const field = location ? LOCATION_FIELD[normalize(location)] : undefined;
  if (field !== undefined && rec[field] !== undefined) return rec[field]!;
  for (const f of FALLBACK_ORDER) {
    if (rec[f] !== undefined) return rec[f]!;
  }
  return null;
}
```

- [ ] **Step 4: Run tests until green**

```sh
cd packages/core && npx vitest run src/shelfLifeLookup.test.ts && cd ../..
```

Expected: all PASS. If a matching test fails, inspect the real dataset rows involved (`grep '"orange' packages/core/src/shelfLifeData.generated.ts`) and adjust the TEST expectation only if the data genuinely lacks that food — never special-case the matcher for one food.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shelfLifeLookup.ts packages/core/src/shelfLifeLookup.test.ts
git commit -m "feat(core): data-driven shelf-life lookup (matching + location resolution)"
```

---

### Task 5: Wire the food tier into `suggestShelfLifeDays` (TDD)

**Files:**
- Modify: `packages/core/src/shelfLife.ts` (function `suggestShelfLifeDays`, ~line 36, and `suggestExpiryISO`, ~line 50)
- Modify: `packages/core/src/shelfLife.test.ts` (append a describe block)

- [ ] **Step 1: Add failing tests**

Append to `packages/core/src/shelfLife.test.ts`:

```ts
describe('suggestShelfLifeDays — food tier (FoodKeeper data)', () => {
  it('is location-aware: chicken in the freezer lasts months, in the fridge days', () => {
    const fridge = suggestShelfLifeDays({ name: 'chicken', location: 'fridge' });
    const freezer = suggestShelfLifeDays({ name: 'chicken', location: 'freezer' });
    expect(fridge).not.toBeNull();
    expect(freezer).not.toBeNull();
    expect(fridge!).toBeLessThanOrEqual(3);
    expect(freezer!).toBeGreaterThanOrEqual(200);
  });

  it('food match beats the category default (butter != generic dairy 10d)', () => {
    // Old behavior: 'butter' -> dairy -> 10. FoodKeeper: fridge ~46 days.
    expect(suggestShelfLifeDays({ name: 'butter', location: 'fridge' })).toBeGreaterThan(10);
  });

  it('keeps the category tier as fallback for foods the dataset lacks', () => {
    // categorizeByName covers 'kombucha' (beverage); FoodKeeper does not.
    expect(suggestShelfLifeDays({ name: 'kombucha' })).toBe(90);
  });

  it('still returns null with no signal at all', () => {
    expect(suggestShelfLifeDays({ name: 'zzqx flurbo' })).toBeNull();
  });

  it('suggestExpiryISO forwards the location', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const fridge = suggestExpiryISO({ name: 'chicken', location: 'fridge' }, now);
    const freezer = suggestExpiryISO({ name: 'chicken', location: 'freezer' }, now);
    expect(fridge).not.toBeNull();
    expect(freezer).not.toBeNull();
    expect(new Date(freezer!).getTime()).toBeGreaterThan(new Date(fridge!).getTime());
  });
});
```

(If the file doesn't already import `suggestExpiryISO`, extend the existing import from `'./shelfLife.ts'`.)

- [ ] **Step 2: Run to verify the new block fails**

```sh
cd packages/core && npx vitest run src/shelfLife.test.ts && cd ../..
```

Expected: new tests FAIL (location ignored / butter = 10); pre-existing tests still PASS.

- [ ] **Step 3: Implement the tier wiring**

In `packages/core/src/shelfLife.ts`, add the import at the top:

```ts
import { daysForLocation, matchFood } from './shelfLifeLookup.ts';
```

Replace `suggestShelfLifeDays` and `suggestExpiryISO` with:

```ts
/**
 * Suggested shelf life in days. Tiers, in order:
 *   1. Food match against the bundled FoodKeeper dataset (location-aware —
 *      'pantry' | 'fridge' | 'freezer'; custom locations fall back
 *      fridge -> pantry -> freezer).
 *   2. Explicit category, else a category inferred from the name, via
 *      DEFAULT_SHELF_LIFE (the pre-dataset behavior, kept as fallback).
 *   3. null — no confident suggestion; the caller leaves expiry blank.
 */
export function suggestShelfLifeDays(opts: {
  name?: string;
  category?: string;
  location?: string;
}): number | null {
  if (opts.name) {
    const food = matchFood(opts.name);
    if (food) {
      const days = daysForLocation(food, opts.location);
      if (days !== null) return days;
    }
  }
  const cat = opts.category ?? (opts.name ? categorizeByName(opts.name) : undefined);
  if (!cat) return null;
  const days = DEFAULT_SHELF_LIFE[cat];
  return typeof days === 'number' ? days : null;
}

/** Suggested expiry as an ISO timestamp (UTC midnight, `days` out), or null when no signal. */
export function suggestExpiryISO(
  opts: { name?: string; category?: string; location?: string },
  now: Date = new Date(),
): string | null {
  const days = suggestShelfLifeDays(opts);
  if (days === null) return null;
  return addDaysUTC(now, days).toISOString();
}
```

(`categorizeByName`, `DEFAULT_SHELF_LIFE`, and `addDaysUTC` already exist in the file — do not duplicate them.)

- [ ] **Step 4: Run the full core suite**

```sh
cd packages/core && npm test && cd ../..
```

Expected: ALL tests pass — including every pre-existing `shelfLife` test. If a pre-existing test fails because the food tier now returns a *better* number for a name it covers (e.g. a test hard-coding `milk -> 10`), that is a deliberate behavior upgrade: update that test's expectation and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shelfLife.ts packages/core/src/shelfLife.test.ts
git commit -m "feat(core): location-aware shelf-life suggestions — food tier before category tier"
```

---

### Task 6: Add Item passes the picked location

**Files:**
- Modify: `apps/mobile/src/features/pantry/AddItemScreen.tsx:81`

- [ ] **Step 1: Update the suggestion memo**

Line 81 currently reads:

```ts
const suggestedDays = useMemo(() => suggestShelfLifeDays({ name: trimmedName }), [trimmedName]);
```

Change to:

```ts
const suggestedDays = useMemo(
  () => suggestShelfLifeDays({ name: trimmedName, location }),
  [trimmedName, location],
);
```

(`location` is already in scope — `useState<StorageLocation>('pantry')` at ~line 68. The `expiryTouched`/`effectiveDays` guard on the next line already ensures a manually-set date is never overwritten; no other change needed.)

- [ ] **Step 2: Run the mobile test suite + typecheck**

```sh
cd apps/mobile && npx tsc -p tsconfig.json --noEmit && npm test 2>&1 | tail -5 && cd ../..
```

Expected: typecheck clean; jest suite passes.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/pantry/AddItemScreen.tsx
git commit -m "feat(pantry): expiry auto-fill reacts to storage location (freezer chicken != fridge chicken)"
```

---

### Task 7: Full verification + PR

- [ ] **Step 1: Whole-repo checks**

```sh
cd /c/Users/JCS/Pantry-Party
npm run lint 2>&1 | tail -3
cd packages/core && npm test && cd ../..
cd services/api && npm test 2>&1 | tail -3 && cd ../..
```

Expected: lint 0 errors; core + api suites green.

- [ ] **Step 2: Manual sanity (optional but recommended)**

```sh
node -e "const {suggestShelfLifeDays}=require('./packages/core/dist/index.js')" 2>/dev/null || \
npx tsx -e "import {suggestShelfLifeDays} from './packages/core/src/index.ts'; console.log('chicken fridge:', suggestShelfLifeDays({name:'chicken',location:'fridge'}), '| freezer:', suggestShelfLifeDays({name:'chicken',location:'freezer'}), '| bread pantry:', suggestShelfLifeDays({name:'sourdough bread',location:'pantry'}))"
```

Expected: fridge ≈ 1-2, freezer ≈ 365, bread a small number — eyeball plausibility.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/shelf-life-db
gh pr create --base main --title "feat: location-aware shelf-life database (USDA FoodKeeper) for expiry auto-fill" --body "Implements docs/superpowers/specs/2026-07-09-shelf-life-database-design.md: data/shelf-life pipeline -> generated core dataset (~600 foods, public domain) -> food-tier lookup in suggestShelfLifeDays (location-aware, category tier kept as fallback) -> AddItemScreen passes the picked location. JS-only: OTA-shippable."
```

Expected: PR URL printed.
