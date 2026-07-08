/**
 * US grocery chain suggestions for the favorite-stores picker.
 *
 * Display-only seeds — users can also add custom local store names. Not tied to
 * receipt OCR vendors; future receipt parsing can use these as hints.
 */

export interface StoreChain {
  /** Stable id for deduping selections. */
  id: string;
  /** Human label shown in the picker. */
  name: string;
  /** Broad region hint for sorting suggestions (not geo-fenced). */
  region: "national" | "west" | "midwest" | "south" | "northeast";
}

/** Curated chains common in US grocery — alphabetical within region groups. */
export const STORE_CHAINS: StoreChain[] = [
  { id: "aldi", name: "Aldi", region: "national" },
  { id: "costco", name: "Costco", region: "national" },
  { id: "kroger", name: "Kroger", region: "national" },
  { id: "publix", name: "Publix", region: "south" },
  { id: "safeway", name: "Safeway", region: "west" },
  { id: "target", name: "Target", region: "national" },
  { id: "trader-joes", name: "Trader Joe's", region: "national" },
  { id: "walmart", name: "Walmart", region: "national" },
  { id: "whole-foods", name: "Whole Foods", region: "national" },
  { id: "heb", name: "H-E-B", region: "south" },
  { id: "meijer", name: "Meijer", region: "midwest" },
  { id: "wegmans", name: "Wegmans", region: "northeast" },
  { id: "sprouts", name: "Sprouts", region: "west" },
  { id: "food-lion", name: "Food Lion", region: "south" },
  { id: "giant-eagle", name: "Giant Eagle", region: "midwest" },
  { id: "hy-vee", name: "Hy-Vee", region: "midwest" },
  { id: "ralphs", name: "Ralphs", region: "west" },
  { id: "stop-shop", name: "Stop & Shop", region: "northeast" },
  { id: "winndixie", name: "Winn-Dixie", region: "south" },
];

export function chainById(id: string): StoreChain | undefined {
  return STORE_CHAINS.find((c) => c.id === id);
}
