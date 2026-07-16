#!/usr/bin/env node
/**
 * Merges variants-batches/*.json + the existing curated.variants.json into a
 * single sorted curated.variants.json AND its mobile bundle copy.
 * Later files never silently overwrite: duplicate (recipeId, device) pairs abort.
 * Usage: node merge-variants.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = join(HERE, 'curated.variants.json');
const BUNDLE = join(HERE, '..', '..', 'apps', 'mobile', 'src', 'data', 'curated', 'curated.variants.json');
const BATCH_DIR = join(HERE, 'variants-batches');

const all = [...JSON.parse(readFileSync(MAIN, 'utf8'))];
for (const f of readdirSync(BATCH_DIR).filter((f) => /^batch-\d+\.json$/.test(f)).sort()) {
  all.push(...JSON.parse(readFileSync(join(BATCH_DIR, f), 'utf8')));
}
const seen = new Set();
for (const v of all) {
  const key = `${v.recipeId}:${v.device}`;
  if (seen.has(key)) { console.error(`DUPLICATE pair ${key} — aborting, nothing written`); process.exit(1); }
  seen.add(key);
}
all.sort((a, b) => a.recipeId - b.recipeId || a.device.localeCompare(b.device));
const json = JSON.stringify(all, null, 2) + '\n';
writeFileSync(MAIN, json);
writeFileSync(BUNDLE, json);
console.log(`merged ${all.length} variants -> curated.variants.json (+ bundle copy)`);
