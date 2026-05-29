/**
 * Phase 0 — capture spike · Build the real test set from a CSV.
 *
 * Fill a spreadsheet (barcode, expectedName, kind, category, store, note), export CSV,
 * run this. It writes src/testset.json (which the harness prefers over the sample) and
 * prints a distribution report so you can see if your set is balanced and big enough.
 *
 *   node src/csvToTestset.mjs            # reads ./testset.csv
 *   node src/csvToTestset.mjs path.csv
 *
 * GROUND-TRUTH RULE: expectedName must be the human-readable name on the physical
 * package / receipt — NEVER copied from a lookup database. Independent labels are the
 * whole point; self-labeled data measures nothing. THROWAWAY tooling.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2] || join(__dirname, "..", "testset.csv");
const outPath = join(__dirname, "testset.json");

/** Minimal RFC4180-ish CSV parser: handles quoted fields with commas and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false, i = 0;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { endField(); endRow(); i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { endField(); endRow(); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const rows = parseCsv(readFileSync(inPath, "utf8"));
if (rows.length < 2) { console.error("CSV needs a header row + at least one data row."); process.exit(1); }

const header = rows[0].map((h) => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);
const bI = col("barcode"), nI = col("expectedname"), kI = col("kind"), cI = col("category"), sI = col("store"), noI = col("note");
if (bI < 0 || nI < 0) { console.error("CSV header must include at least: barcode, expectedName"); process.exit(1); }

const items = [], warnings = [];
for (let r = 1; r < rows.length; r++) {
  const cells = rows[r];
  const barcode = (cells[bI] || "").trim();
  const expectedName = (cells[nI] || "").trim();
  if (!barcode || !expectedName) { warnings.push(`row ${r + 1}: missing barcode or expectedName — skipped`); continue; }
  const kind = ((kI >= 0 ? cells[kI] : "") || "").trim().toLowerCase() === "produce" ? "produce" : "barcode";
  const item = { barcode, expectedName, kind };
  if (cI >= 0 && cells[cI]?.trim()) item.category = cells[cI].trim().toLowerCase();
  if (sI >= 0 && cells[sI]?.trim()) item.store = cells[sI].trim();
  if (noI >= 0 && cells[noI]?.trim()) item.note = cells[noI].trim();
  items.push(item);
}

writeFileSync(outPath, JSON.stringify({
  _comment: "Real labeled capture test set. expectedName is INDEPENDENT ground truth (the name on the package/receipt), never copied from a lookup DB. Built via csvToTestset.mjs.",
  items,
}, null, 2));

const byKind = {}, byCat = {};
for (const it of items) { byKind[it.kind] = (byKind[it.kind] || 0) + 1; const c = it.category || "(uncategorized)"; byCat[c] = (byCat[c] || 0) + 1; }
console.log(`\n  Wrote ${items.length} items → src/testset.json`);
console.log(`  By kind: ${JSON.stringify(byKind)}`);
console.log("  By category:");
for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`    ${c.padEnd(16)} ${n}`);
if (items.length < 500) console.log(`\n  ⚠ ${items.length}/500 — keep collecting. Aim for 500+ for a number you can trust.`);
if (warnings.length) { console.log(`\n  ${warnings.length} rows skipped:`); warnings.slice(0, 8).forEach((w) => console.log("   - " + w)); }
console.log("");
