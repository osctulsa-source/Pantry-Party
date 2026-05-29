/**
 * Phase 0 — Capture spike · Harness
 *
 * Runs the barcode cascade against the test set and prints the number that decides
 * whether the ≥90% bar is reachable. Writes a timestamped results file.
 *
 *   npm start            # quiet — just the summary
 *   npm start:verbose    # per-item breakdown
 *
 * THROWAWAY. The output is a decision input, not a feature.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveBarcode, type ProductHit } from "./barcodeCascade.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("--verbose");

interface TestItem {
  barcode: string;
  expectedName: string;
  note?: string;
}

const TARGET = 0.9; // the bar from the scope doc

function matches(hit: ProductHit, expected: string): boolean {
  if (!hit.name) return false;
  const a = hit.name.toLowerCase();
  const b = expected.toLowerCase();
  return a.includes(b) || b.includes(a);
}

async function main() {
  const raw = JSON.parse(readFileSync(join(__dirname, "testset.sample.json"), "utf8"));
  const items: TestItem[] = raw.items;

  console.log(`\n  Capture-accuracy spike · ${items.length} items · target ≥ ${TARGET * 100}%\n`);

  let correct = 0;
  const bySource: Record<string, number> = {};
  const misses: TestItem[] = [];

  for (const item of items) {
    const hit = await resolveBarcode(item.barcode);
    const ok = matches(hit, item.expectedName);
    if (ok) correct++;
    else misses.push(item);
    bySource[hit.source] = (bySource[hit.source] ?? 0) + 1;

    if (verbose) {
      const mark = ok ? "✓" : "✗";
      console.log(`  ${mark}  ${item.barcode}  →  ${hit.name ?? "(miss)"}  [${hit.source}]`);
    }
  }

  const rate = correct / items.length;
  const pass = rate >= TARGET;

  console.log(`\n  ───────────────────────────────────────`);
  console.log(`  Hit rate:   ${(rate * 100).toFixed(1)}%   (${correct}/${items.length})`);
  console.log(`  Target:     ${TARGET * 100}%   ${pass ? "✓ PASS" : "✗ BELOW BAR"}`);
  console.log(`  By source:  ${JSON.stringify(bySource)}`);
  if (misses.length) {
    console.log(`  Misses:     ${misses.map((m) => m.expectedName).join(", ")}`);
  }
  console.log(`  ───────────────────────────────────────`);
  if (!pass) {
    console.log(`\n  ⚠  Below target. Before paying for a tier-3 vendor, check WHY:`);
    console.log(`     produce/PLU items (no barcode) should route to manual entry, not count as misses.`);
    console.log(`     A realistic 500-item set with proper routing is what the real decision rests on.\n`);
  } else {
    console.log(`\n  Reachable. Log the decision in docs/DECISIONS.md and move to Phase 1.\n`);
  }

  const resultsDir = join(__dirname, "..", "results");
  mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(
    join(resultsDir, `capture-${stamp}.json`),
    JSON.stringify({ rate, correct, total: items.length, bySource, misses }, null, 2),
  );
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
