#!/usr/bin/env node
/**
 * Validator for Pantry Party curated recipes (see SPEC.md).
 * Usage:
 *   node validate.mjs <file.json> [more.json...]
 *     Validates base recipe files (see SPEC.md).
 *   node validate.mjs --variants <file.json> [more.json...] [--base <file.json>]
 *     Validates device-variant files against a base recipe file
 *     (see SPEC-VARIANTS.md). --base defaults to curated.recipes.json.
 * Exits 1 on any ERROR. Warnings don't fail the run.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const MEALS = new Set(['breakfast', 'main course', 'dessert', 'snack']);
const DIFF = new Set(['easy', 'medium']);
const DEVICES = new Set([
  'crockpot', 'instantpot', 'airfryer', 'sheetpan', 'microwave',
  'nocook', 'stove', 'oven', 'grill', 'griddle',
]);

let errors = 0;
let warnings = 0;
const err = (f, id, msg) => { errors++; console.log(`ERROR [${f}${id ? ' #' + id : ''}] ${msg}`); };
const warn = (f, id, msg) => { warnings++; console.log(`warn  [${f}${id ? ' #' + id : ''}] ${msg}`); };

const seenIds = new Set();
const seenTitles = new Set();
let total = 0;

/** Recipe mode: validate curated recipe files (see SPEC.md). */
function validateRecipes(files) {
for (const file of files) {
  let arr;
  try {
    arr = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(file, '', `does not parse as JSON: ${e.message}`);
    continue;
  }
  if (!Array.isArray(arr)) { err(file, '', 'top level must be an array'); continue; }

  for (const r of arr) {
    total++;
    const id = r?.id ?? '?';
    const where = (m) => err(file, id, m);

    if (!Number.isInteger(r.id) || r.id < 9000000) where('id must be an integer >= 9000000');
    else if (seenIds.has(r.id)) where('duplicate id');
    else seenIds.add(r.id);

    if (typeof r.title !== 'string' || r.title.trim().length < 3) where('title missing/too short');
    else {
      const t = r.title.toLowerCase().trim();
      if (seenTitles.has(t)) where(`duplicate title "${r.title}"`);
      else seenTitles.add(t);
    }

    if (!(r.image === '' || /^https:\/\//.test(r.image))) where('image must be "" or an https URL');
    if (!DIFF.has(r.difficulty)) where(`difficulty must be easy|medium (got ${r.difficulty})`);
    if (!MEALS.has(r.mealType)) where(`mealType invalid (got ${r.mealType})`);
    if (!Array.isArray(r.cuisines) || r.cuisines.some((c) => typeof c !== 'string')) where('cuisines must be string[]');
    if (!Number.isInteger(r.readyInMinutes) || r.readyInMinutes < 5 || r.readyInMinutes > 180) where('readyInMinutes out of range 5-180');
    if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 12) where('servings out of range 1-12');
    for (const b of ['vegetarian', 'vegan', 'glutenFree']) if (typeof r[b] !== 'boolean') where(`${b} must be boolean`);
    if (r.vegan === true && r.vegetarian !== true) where('vegan implies vegetarian');
    if (r.healthScore !== null) where('healthScore must be null');
    if (r.sourceUrl !== '') where('sourceUrl must be ""');
    if (r.sourceName !== 'Pantry Party Kitchen') where('sourceName must be "Pantry Party Kitchen"');
    if (typeof r.summary !== 'string' || r.summary.length < 20) where('summary missing/too short');
    else if (r.summary.length > 240) warn(file, id, `summary long (${r.summary.length} chars)`);

    // Ingredients
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 3 || r.ingredients.length > 14) {
      where('ingredients must be an array of 3-14');
    } else {
      for (const [i, ing] of r.ingredients.entries()) {
        if (typeof ing.name !== 'string' || ing.name.length === 0) where(`ingredient[${i}] name missing`);
        if (ing.name && ing.name !== ing.name.toLowerCase()) warn(file, id, `ingredient "${ing.name}" not lowercase`);
        if (typeof ing.original !== 'string' || ing.original.length === 0) where(`ingredient[${i}] original missing`);
        if (!(ing.amount === null || typeof ing.amount === 'number')) where(`ingredient[${i}] amount must be number|null`);
        if (typeof ing.unit !== 'string') where(`ingredient[${i}] unit must be string`);
      }
    }

    // Instructions
    if (!Array.isArray(r.instructions) || r.instructions.length !== 1 || r.instructions[0]?.name !== '') {
      where('instructions must be exactly one group with name ""');
      continue;
    }
    const steps = r.instructions[0].steps;
    const maxSteps = r.difficulty === 'easy' ? 10 : 12;
    if (!Array.isArray(steps) || steps.length < 4 || steps.length > maxSteps) {
      where(`steps must be 4-${maxSteps} (got ${steps?.length})`);
      continue;
    }
    const ingNames = (r.ingredients ?? []).map((x) => (x.name ?? '').toLowerCase());
    const usedInSteps = new Set();
    let stepMinutes = 0;
    for (const [si, s] of steps.entries()) {
      if (s.number !== si + 1) where(`step ${si + 1} misnumbered (got ${s.number})`);
      if (typeof s.step !== 'string' || s.step.length < 15) where(`step ${si + 1} text missing/too short`);
      if (!Array.isArray(s.ingredients) || !Array.isArray(s.equipment)) { where(`step ${si + 1} ingredients/equipment must be arrays`); continue; }
      if (!(s.lengthMinutes === null || (Number.isInteger(s.lengthMinutes) && s.lengthMinutes >= 1 && s.lengthMinutes <= 240)))
        where(`step ${si + 1} lengthMinutes must be null or 1-240`);
      else if (typeof s.lengthMinutes === 'number') stepMinutes += s.lengthMinutes;
      for (const n of s.ingredients) {
        const nl = String(n).toLowerCase();
        const hit = ingNames.find((g) => g.includes(nl) || nl.includes(g));
        if (!hit) where(`step ${si + 1} ingredient "${n}" matches no recipe ingredient`);
        else usedInSteps.add(hit);
      }
    }
    for (const g of ingNames) {
      if (!usedInSteps.has(g)) warn(file, id, `ingredient "${g}" never referenced by any step`);
    }
    if (stepMinutes > r.readyInMinutes) warn(file, id, `step minutes (${stepMinutes}) exceed readyInMinutes (${r.readyInMinutes})`);
  }
}
}

/** --variants mode: validate variant files against the base recipe file. */
function validateVariants(files, baseFile) {
  let base;
  try {
    base = JSON.parse(readFileSync(baseFile, 'utf8'));
  } catch (e) {
    err(baseFile, '', `base file does not parse as JSON: ${e.message}`);
    return 0;
  }
  if (!Array.isArray(base)) { err(baseFile, '', 'base top level must be an array'); return 0; }
  const baseById = new Map(base.map((r) => [r.id, r]));
  const seenPairs = new Set();
  let count = 0;

  for (const file of files) {
    let arr;
    try {
      arr = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      err(file, '', `does not parse as JSON: ${e.message}`);
      continue;
    }
    if (!Array.isArray(arr)) { err(file, '', 'top level must be an array'); continue; }

    for (const v of arr) {
      count++;
      const id = `${v?.recipeId ?? '?'}/${v?.device ?? '?'}`;
      const where = (m) => err(file, id, m);

      if (!Number.isInteger(v.recipeId)) where('recipeId must be an integer');
      const baseRecipe = baseById.get(v.recipeId);
      if (!baseRecipe) { where('recipeId matches no base recipe'); continue; }

      if (!DEVICES.has(v.device)) { where(`unknown device "${v.device}"`); continue; }
      const pair = `${v.recipeId}:${v.device}`;
      if (seenPairs.has(pair)) where('duplicate (recipeId, device) pair');
      else seenPairs.add(pair);

      if (!Number.isInteger(v.readyInMinutes) || v.readyInMinutes < 5 || v.readyInMinutes > 600)
        where('readyInMinutes out of range 5-600');

      if (!Array.isArray(v.steps) || v.steps.length < 4 || v.steps.length > 12) {
        where(`steps must be 4-12 (got ${v.steps?.length})`);
        continue;
      }
      const ingNames = (baseRecipe.ingredients ?? []).map((x) => (x.name ?? '').toLowerCase());
      let stepMinutes = 0;
      for (const [si, s] of v.steps.entries()) {
        if (s.number !== si + 1) where(`step ${si + 1} misnumbered (got ${s.number})`);
        if (typeof s.step !== 'string' || s.step.length < 15) where(`step ${si + 1} text missing/too short`);
        if (!Array.isArray(s.ingredients) || !Array.isArray(s.equipment)) { where(`step ${si + 1} ingredients/equipment must be arrays`); continue; }
        if (!(s.lengthMinutes === null || (Number.isInteger(s.lengthMinutes) && s.lengthMinutes >= 1 && s.lengthMinutes <= 600)))
          where(`step ${si + 1} lengthMinutes must be null or 1-600`);
        else if (typeof s.lengthMinutes === 'number') stepMinutes += s.lengthMinutes;
        for (const n of s.ingredients) {
          const nl = String(n).toLowerCase();
          if (!ingNames.some((g) => g.includes(nl) || nl.includes(g)))
            where(`step ${si + 1} ingredient "${n}" matches no base recipe ingredient`);
        }
      }
      if (stepMinutes > v.readyInMinutes) warn(file, id, `step minutes (${stepMinutes}) exceed readyInMinutes (${v.readyInMinutes})`);
    }
  }
  return count;
}

const args = process.argv.slice(2);
if (args[0] === '--variants') {
  const rest = args.slice(1);
  const baseIdx = rest.indexOf('--base');
  const baseFile = baseIdx >= 0 ? rest[baseIdx + 1] : join(HERE, 'curated.recipes.json');
  const files = baseIdx >= 0 ? [...rest.slice(0, baseIdx), ...rest.slice(baseIdx + 2)] : rest;
  const n = validateVariants(files, baseFile);
  console.log(`\nchecked ${n} variants — ${errors} errors, ${warnings} warnings`);
} else {
  validateRecipes(args);
  console.log(`\nchecked ${total} recipes — ${errors} errors, ${warnings} warnings`);
}
if (errors > 0) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
