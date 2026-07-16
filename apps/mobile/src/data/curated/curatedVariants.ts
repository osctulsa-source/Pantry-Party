/**
 * Device-variant instructions for curated recipes.
 *
 * Sidecar to curated.recipes.json (authoring source of truth:
 * data/recipes/curated.variants.json — validate.mjs --variants cross-checks
 * it against the base file; THIS json is the bundle copy, keep both in sync).
 * A variant is a full alternate instruction set converting a base recipe to
 * another cooking device: its own steps and readyInMinutes, but the SAME
 * ingredient list — so pantry matching, Add-missing, and Cooked-it flows
 * never need to know variants exist.
 *
 * Parsing is defensive: malformed entries are dropped silently so bad data
 * can never crash the Cook tab (the validator catches them before merge —
 * this is belt-and-suspenders for the shipped bundle).
 */
import { COOKING_DEVICES, type CookingDevice } from '@breadbox/core';

import type { RecipeStep } from '../spoonacular/types';
import variantsJson from './curated.variants.json';

export interface DeviceVariant {
  recipeId: number;
  device: CookingDevice;
  readyInMinutes: number;
  steps: RecipeStep[];
}

const DEVICE_IDS = new Set<string>(COOKING_DEVICES.map((d) => d.id));

function isStep(s: unknown): s is RecipeStep {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.number === 'number' &&
    typeof o.step === 'string' &&
    Array.isArray(o.ingredients) &&
    Array.isArray(o.equipment) &&
    (o.lengthMinutes === null || typeof o.lengthMinutes === 'number')
  );
}

function isVariant(v: unknown): v is DeviceVariant {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Number.isInteger(o.recipeId) &&
    typeof o.device === 'string' &&
    DEVICE_IDS.has(o.device) &&
    Number.isInteger(o.readyInMinutes) &&
    Array.isArray(o.steps) &&
    o.steps.length > 0 &&
    o.steps.every(isStep)
  );
}

/** Index raw bundle data by recipeId, dropping anything malformed. */
export function parseVariants(raw: unknown): Map<number, DeviceVariant[]> {
  const map = new Map<number, DeviceVariant[]>();
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (!isVariant(entry)) continue;
    const list = map.get(entry.recipeId);
    if (list) list.push(entry);
    else map.set(entry.recipeId, [entry]);
  }
  return map;
}

// JSON import types are structural; the dataset is validated against the
// DeviceVariant shape by data/recipes/validate.mjs --variants at authoring
// time, and defensively re-checked here by parseVariants.
const VARIANTS = parseVariants(variantsJson as unknown);

/** All device variants for a recipe — [] for Spoonacular ids and unconverted recipes. */
export function getDeviceVariants(recipeId: number): DeviceVariant[] {
  return VARIANTS.get(recipeId) ?? [];
}

/** Device ids a recipe converts to — unioned into ranking's detected set. */
export function getVariantDeviceIds(recipeId: number): CookingDevice[] {
  return getDeviceVariants(recipeId).map((v) => v.device);
}

/**
 * The detail screen's default switcher position: the first of tonight's
 * picked devices that has a variant, in the user's selection order. Null
 * means show the original instructions.
 */
export function pickDefaultDevice(
  tonight: CookingDevice[],
  variants: DeviceVariant[],
): CookingDevice | null {
  for (const d of tonight) {
    if (variants.some((v) => v.device === d)) return d;
  }
  return null;
}
