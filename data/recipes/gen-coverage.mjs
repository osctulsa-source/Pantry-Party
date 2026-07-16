#!/usr/bin/env node
/**
 * Generates variants-coverage.json: per recipe x device, "native" | "todo".
 * The authoring pass resolves each "todo" to "convert" (author a variant) or
 * "skip" (culinary nonsense). KEEP THE KEYWORD TABLE IN SYNC with
 * packages/core/src/cookingDevice.ts (COOKING_DEVICES + STOVE_EXCEPTIONS).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const KEYWORDS = {
  crockpot: ['slow cooker', 'slow-cooker', 'crock pot', 'crockpot', 'slow-cooked'],
  instantpot: ['instant pot', 'instantpot', 'pressure cooker', 'pressure cook', 'multicooker'],
  airfryer: ['air fryer', 'air-fryer', 'air fried', 'air-fried'],
  sheetpan: ['sheet pan', 'sheet-pan', 'sheetpan', 'baking sheet'],
  microwave: ['microwave', 'microwaved'],
  nocook: ['no-cook', 'no cook', 'no-bake', 'no bake'],
  stove: ['skillet', 'saucepan', 'sauté pan', 'saute pan', 'frying pan', 'stovetop', 'stove', 'wok', 'pan-fried', 'pan-seared'],
  oven: ['oven', 'baking dish', 'roasting pan', 'casserole dish', 'baked', 'roasted'],
  grill: ['grill', 'grilled', 'barbecue', 'bbq'],
  griddle: ['griddle', 'flat top', 'flat-top', 'plancha'],
};
const STOVE_EXCEPTIONS = ['dutch oven', 'grill pan'];

const recipes = JSON.parse(readFileSync(join(HERE, 'curated.recipes.json'), 'utf8'));
const out = recipes.map((r) => {
  let hay = [r.title, ...r.instructions[0].steps.flatMap((s) => s.equipment)].join(' | ').toLowerCase();
  const native = new Set();
  for (const p of STOVE_EXCEPTIONS) {
    if (hay.includes(p)) { native.add('stove'); hay = hay.split(p).join(' '); }
  }
  for (const [device, kws] of Object.entries(KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) native.add(device);
  }
  const devices = {};
  for (const device of Object.keys(KEYWORDS)) {
    devices[device] = native.has(device) ? 'native' : 'todo';
  }
  return { recipeId: r.id, title: r.title, mealType: r.mealType, devices };
});
writeFileSync(join(HERE, 'variants-coverage.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote coverage for ${out.length} recipes`);
