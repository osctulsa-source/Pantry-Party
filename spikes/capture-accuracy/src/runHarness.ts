/**
 * Phase 0 — Capture spike · Harness (v2)
 *
 * Reports the RIGHT things instead of one misleading number:
 *   1. Resolution rate  — of barcoded items, how many returned a real product?
 *   2. Name accuracy    — of those that resolved, how many match the expected name?
 *   3. Produce routing  — PLU / produce items are excluded from barcode metrics
 *                         (they belong in manual entry, not the scanner).
 *
 *   npm start            # summary only
 *   npm run start:verbose
 *
 * THROWAWAY. The output is a decision input, not a feature. And remember: a clean
 * number here means nothing until the test set is REAL (independently-labeled receipts).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveBarcode, type ProductHit } from "./barcodeCascade.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("--verbose");
const RESOLUTION_TARGET = 0.9;

interface TestItem {
  barcode: string;
  expectedName: string;
  kind?: "barcode" | "produce";
  note?: string;
}

/** Normalize a product string: drop sizes, brands-ish noise, punctuation. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(\.\d+)?\s?(oz|lb|lbs|g|kg|ml|l|ct|pk|pack|gal)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 3);
}

/** Loose match: normalized substring either direction, or a shared significant token. */
function looseMatch(resolved: string, expected: string): boolean {
  const a = normalize(resolved);
  const b = normalize(expected);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = tokens(resolved);
  const tb = tokens(expected);
  for (const x of ta) {
    for (const y of tb) {
      if (x === y) return true;
      if (x.length >= 5 && y.length >= 5 && (x.startsWith(y.slice(0, 5)) || y.startsWith(x.slice(0, 5)))) return true;
    }
  }
  return false;
}

async function main() {
  const realPath = join(__dirname, "testset.json");
  const samplePath = join(__dirname, "testset.sample.json");
  const usingReal = existsSync(realPath);
  const raw = JSON.parse(readFileSync(usingReal ? realPath : samplePath, "utf8"));
  const items: TestItem[] = raw.items;
  console.log(`  source: ${usingReal ? "testset.json — your real labeled set" : "testset.sample.json — smoke sample (build the real set to get a meaningful number)"}`);
  const barcoded = items.filter((i) => i.kind !== "produce");
  const produce = items.filter((i) => i.kind === "produce");

  console.log(`\n  Capture spike · ${items.length} items (${barcoded.length} barcoded, ${produce.length} produce)\n`);

  let resolved = 0;
  let nameMatched = 0;
  const misses: string[] = [];

  for (const item of barcoded) {
    const hit: ProductHit = await resolveBarcode(item.barcode);
    const didResolve = hit.name !== null && hit.source !== "miss";
    const matched = didResolve && looseMatch(hit.name!, item.expectedName);
    if (didResolve) resolved++;
    else misses.push(item.expectedName);
    if (matched) nameMatched++;

    if (verbose) {
      const mark = !didResolve ? "·miss" : matched ? "✓" : "≈"; // ≈ = resolved but name differs from label
      console.log(`  ${mark}  ${item.barcode}  →  ${hit.name ?? "(miss)"}  [${hit.source}]`);
    }
  }

  if (verbose && produce.length) {
    for (const p of produce) console.log(`  →manual  ${p.barcode}  (${p.expectedName}: produce/PLU, route to manual entry)`);
  }

  const resolutionRate = barcoded.length ? resolved / barcoded.length : 0;
  const nameAccuracy = resolved ? nameMatched / resolved : 0;

  console.log(`\n  ───────────────────────────────────────`);
  console.log(`  Resolution rate:  ${(resolutionRate * 100).toFixed(1)}%  (${resolved}/${barcoded.length} barcoded items returned a product)`);
  console.log(`  Name accuracy:    ${(nameAccuracy * 100).toFixed(1)}%  (${nameMatched}/${resolved} of those match the label)`);
  console.log(`  Produce routed:   ${produce.length}  (PLU items excluded from barcode metrics → manual entry)`);
  if (misses.length) console.log(`  Did not resolve:  ${misses.join(", ")}`);
  console.log(`  ───────────────────────────────────────`);
  console.log(
    resolutionRate >= RESOLUTION_TARGET
      ? `\n  Resolution clears ${RESOLUTION_TARGET * 100}% on this sample. The real test is a 500-item\n  set with INDEPENDENT labels from real receipts — that's the number that decides ADR.\n`
      : `\n  Below ${RESOLUTION_TARGET * 100}% resolution on this tiny sample — expected. The misses show the\n  long tail free databases don't cover (where community contributions or a tier-3\n  vendor help). Decide nothing until the 500-item real-receipt set is built.\n`,
  );

  const resultsDir = join(__dirname, "..", "results");
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(
    join(resultsDir, `capture-${stamp}.json`),
    JSON.stringify({ resolutionRate, nameAccuracy, resolved, nameMatched, barcoded: barcoded.length, produce: produce.length, misses }, null, 2),
  );
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
