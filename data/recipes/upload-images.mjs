#!/usr/bin/env node
/**
 * Upload recipe JPEGs from data/recipes/images/ to the public
 * recipe-images Supabase Storage bucket, then patch both curated JSON copies.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node data/recipes/upload-images.mjs
 *
 * Optional:
 *   SUPABASE_URL=https://yclvepnvoisgprqcenvj.supabase.co
 *   DRY_RUN=1  — print actions only
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const IMAGES_DIR = path.join(__dirname, "images");
const DATA_JSON = path.join(__dirname, "curated.recipes.json");
const MOBILE_JSON = path.join(
  ROOT,
  "apps/mobile/src/data/curated/curated.recipes.json",
);

const SUPABASE_URL = (
  process.env.SUPABASE_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "https://yclvepnvoisgprqcenvj.supabase.co"
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const BUCKET = "recipe-images";

if (!SERVICE_KEY && !DRY_RUN) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY. Export it (Railway / Supabase dashboard) and re-run.",
  );
  process.exit(1);
}

function publicUrl(id) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${id}.jpg`;
}

async function uploadJpeg(id, bytes) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${id}.jpg`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`upload ${id} failed: ${res.status} ${body}`);
  }
}

async function patchJson(filePath, urlById) {
  const recipes = JSON.parse(await readFile(filePath, "utf8"));
  let changed = 0;
  for (const recipe of recipes) {
    const url = urlById.get(recipe.id);
    if (!url) continue;
    if (recipe.image !== url) {
      recipe.image = url;
      changed += 1;
    }
  }
  if (!DRY_RUN) {
    await writeFile(filePath, `${JSON.stringify(recipes, null, 2)}\n`, "utf8");
  }
  return changed;
}

const files = (await readdir(IMAGES_DIR))
  .filter((f) => /^\d+\.jpg$/i.test(f))
  .sort();

if (files.length === 0) {
  console.error(`No JPEGs in ${IMAGES_DIR}`);
  process.exit(1);
}

const urlById = new Map();
let uploaded = 0;

for (const file of files) {
  const id = Number(path.basename(file, ".jpg"));
  const bytes = await readFile(path.join(IMAGES_DIR, file));
  const url = publicUrl(id);
  urlById.set(id, url);
  if (DRY_RUN) {
    console.log(`DRY would upload ${file} (${bytes.length} bytes) -> ${url}`);
  } else {
    await uploadJpeg(id, bytes);
    uploaded += 1;
    console.log(`uploaded ${file}`);
  }
}

const dataChanged = await patchJson(DATA_JSON, urlById);
const mobileChanged = await patchJson(MOBILE_JSON, urlById);

console.log(
  JSON.stringify(
    {
      files: files.length,
      uploaded,
      dataChanged,
      mobileChanged,
      dryRun: DRY_RUN,
    },
    null,
    2,
  ),
);
