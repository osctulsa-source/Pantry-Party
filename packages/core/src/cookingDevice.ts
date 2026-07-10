/**
 * "Cooking with" — tonight's-device detection and soft ranking boost. Pure
 * functions, no I/O — same pattern as useItUp.ts.
 *
 * The Cook tab asks what the user is cooking ON tonight (crockpot, grill, …)
 * and folds a flat boost into its ranking blend for recipes that evidently
 * use a selected device. Detection is keyword matching over the recipe title
 * plus the per-step `equipment` strings that both curated and Spoonacular
 * recipes carry. Soft boost only: non-matching recipes are never penalized
 * or hidden.
 */

export type CookingDevice =
  | "stove"
  | "oven"
  | "crockpot"
  | "airfryer"
  | "grill"
  | "griddle";

export interface CookingDeviceDef {
  id: CookingDevice;
  /** Chip label in the picker UI. */
  label: string;
  /** Short name for the card badge ("Crockpot pick"). */
  badgeLabel: string;
  /** Lowercase phrases matched (substring) against title + equipment. */
  keywords: string[];
}

/** Display order for the prompt card and chip row. */
export const COOKING_DEVICES: CookingDeviceDef[] = [
  {
    id: "stove",
    label: "Stove / pan",
    badgeLabel: "Stovetop",
    keywords: [
      "skillet", "saucepan", "sauté pan", "saute pan", "frying pan",
      "stovetop", "stove", "wok", "pan-fried", "pan-seared",
    ],
  },
  {
    id: "oven",
    label: "Oven",
    badgeLabel: "Oven",
    keywords: [
      "oven", "baking sheet", "sheet pan", "baking dish", "roasting pan",
      "casserole dish", "baked", "roasted",
    ],
  },
  {
    id: "crockpot",
    label: "Crockpot",
    badgeLabel: "Crockpot",
    keywords: ["slow cooker", "slow-cooker", "crock pot", "crockpot", "slow-cooked"],
  },
  {
    id: "airfryer",
    label: "Air fryer",
    badgeLabel: "Air fryer",
    keywords: ["air fryer", "air-fryer", "air fried", "air-fried"],
  },
  {
    id: "grill",
    label: "Grill",
    badgeLabel: "Grill",
    keywords: ["grill", "grilled", "barbecue", "bbq"],
  },
  {
    id: "griddle",
    label: "Griddle",
    badgeLabel: "Griddle",
    keywords: ["griddle", "flat top", "flat-top", "plancha"],
  },
];

/**
 * Flat rank boost when tonight's selection matches — sized to sit beside the
 * use-it-up cap (6) without drowning the taste signal.
 */
export const DEVICE_BOOST = 5;

// Phrases that contain another device's keyword but actually mean stovetop
// cooking. Masked out of the haystack before matching; counted as stove.
const STOVE_EXCEPTIONS = ["dutch oven", "grill pan"];

/** Devices a recipe evidently uses, from its title + per-step equipment. */
export function detectDevices(title: string, equipment: string[]): Set<CookingDevice> {
  let haystack = [title, ...equipment].join(" | ").toLowerCase();
  const detected = new Set<CookingDevice>();
  for (const phrase of STOVE_EXCEPTIONS) {
    if (haystack.includes(phrase)) {
      detected.add("stove");
      haystack = haystack.split(phrase).join(" ");
    }
  }
  for (const device of COOKING_DEVICES) {
    if (device.keywords.some((k) => haystack.includes(k))) detected.add(device.id);
  }
  return detected;
}

/** +DEVICE_BOOST when any selected device was detected, else 0. Flat, never summed. */
export function scoreDeviceBoost(
  selected: CookingDevice[],
  detected: Set<CookingDevice>,
): number {
  return selected.some((d) => detected.has(d)) ? DEVICE_BOOST : 0;
}

/**
 * Card badge naming the first selected device that matched, e.g. "Grill pick".
 * Null when nothing is selected or nothing matched — badge and boost always
 * appear together.
 */
export function formatDeviceBadge(
  selected: CookingDevice[],
  detected: Set<CookingDevice>,
): string | null {
  const hit = selected.find((d) => detected.has(d));
  if (!hit) return null;
  const def = COOKING_DEVICES.find((d) => d.id === hit);
  return def ? `${def.badgeLabel} pick` : null;
}
