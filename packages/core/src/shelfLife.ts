/**
 * Shelf-life suggestions — pure, no I/O. Powers the Add Item expiry auto-fill:
 * suggest a sensible "best before" so users adjust a default instead of typing a date.
 *
 * Three tiers, in priority order:
 *  1. Food tier — USDA FoodKeeper data via matchFood + daysForLocation
 *  2. Category tier — explicit category or keyword inference from the item name
 *  3. Null — no confident suggestion, caller leaves expiry blank
 */
import { DEFAULT_SHELF_LIFE } from './schema';
import { daysForLocation, matchFood } from './shelfLifeLookup';

// Keyword → category. First match wins. Order matters: more-specific intents
// (e.g. "juice", "oil", "canned", "baking soda") are checked before broad words
// (e.g. "orange", "vegetable", "soda") so compound names land correctly.
const NAME_CATEGORY_RULES: Array<[RegExp, string]> = [
  // Preservation words outrank the food word: "canned tomatoes" is a pantry
  // good, not produce — without this, the produce rule's 'tomatoes' hit gave
  // scanned canned goods a days-long fresh-produce expiry.
  [/\b(canned|tinned|jarred|pickled|dried|dehydrated)\b/, 'pantry'],
  [/\b(milk|cream|yogurt|yoghurt|cheese|butter|kefir)\b/, 'dairy'],
  [/\b(chicken|beef|pork|turkey|fish|salmon|shrimp|bacon|sausage|steak|mince|meat)\b/, 'meat'],
  [/\b(bread|bagel|tortilla|bun|roll|muffin|croissant|pastry|cake)\b/, 'bakery'],
  // Before beverage: "baking soda" contains "soda" but is a pantry staple.
  [/\bbaking\s+(soda|powder)\b/, 'pantry'],
  // (?<!baking\s) keeps a bare "soda" as a drink without re-catching baking soda.
  [/\b(juice|(?<!baking\s)soda|beer|wine|kombucha|cola|lemonade|drink|beverage|tea|coffee|water|seltzer|sparkling)\b/, 'beverage'],
  // Branded drinks carry no generic drink word ("Diet Pepsi") — barcode scans
  // store the product name verbatim, so the classifier must know the big
  // brands or scanned sodas fall through to null and the shelf-stable zone.
  [/\b(pepsi|coke|coca.?cola|sprite|fanta|dr\.?\s?pepper|mountain\s+dew|gatorade|powerade|red\s?bull|monster\s+energy|7\s?up|ginger\s+ale|root\s+beer)\b/, 'beverage'],
  [/\b(frozen|ice cream|freezer)\b/, 'frozen'],
  // Pantry compounds before produce: "vegetable oil", "canned tomatoes", "avocado oil".
  [/\b(flour|sugar|salt|rice|pasta|oil|sauce|ketchup|mustard|mayo|vinegar|honey|oats|cereal|bean|beans|canned|stock|broth|spice|pepper|baking|yeast|peanut|jam|pantry|dry)\b/, 'pantry'],
  [/\b(lettuce|spinach|kale|tomato|tomatoes|berry|berries|banana|apple|orange|grape|carrot|broccoli|cucumber|onion|herb|cilantro|parsley|avocado|mushroom|produce|fruit|veg|veggies|vegetable|vegetables|salad)\b/, 'produce'],
];

/** Infer a category from a free-text item name. Returns undefined when nothing matches. */
export function categorizeByName(name: string): string | undefined {
  const n = name.toLowerCase();
  for (const [re, cat] of NAME_CATEGORY_RULES) {
    if (re.test(n)) return cat;
  }
  return undefined;
}

/**
 * Suggested shelf life in days. Three-tier priority:
 *  1. Food tier (FoodKeeper) — when a matching record has a safe duration for this location
 *  2. Category tier — explicit category or keyword inference from the item name
 *  3. Null — no confident suggestion
 */
export function suggestShelfLifeDays(opts: { name?: string; category?: string; location?: string }): number | null {
  if (opts.name) {
    const rec = matchFood(opts.name);
    if (rec) {
      const days = daysForLocation(rec, opts.location);
      if (days !== null) return days;
    }
  }
  const cat = opts.category ?? (opts.name ? categorizeByName(opts.name) : undefined);
  if (!cat) return null;
  const days = DEFAULT_SHELF_LIFE[cat];
  return typeof days === 'number' ? days : null;
}

/**
 * Where a food naturally lives, inferred from its FoodKeeper record: a food
 * with a fridge duration is a fridge food (fresh durations are the reason the
 * record exists), else pantry, else freezer-only. Category keywords answer
 * when no record matches. Null when there's no signal at all.
 *
 * This is the capture-flow default (scan/paste/restock add items without
 * asking where they go). Storing "milk" as pantry and then estimating its
 * expiry with a pantry lookup was how scanned items got wildly wrong dates —
 * the location stored and the location estimated must be the SAME sensible
 * guess, and the user can always correct it per item.
 */
export function suggestStorageLocation(name: string, category?: string): 'fridge' | 'pantry' | 'freezer' | null {
  const rec = matchFood(name);
  if (rec && (rec.p !== undefined || rec.f !== undefined)) {
    // A food's natural home is where it keeps LONGEST: butter (2d counter /
    // 46d fridge) is a fridge food; canned tomatoes (~18mo pantry / days once
    // opened+refrigerated) are a pantry food. Freezer durations are ignored —
    // they mean "can be frozen", not "lives in the freezer" (FoodKeeper's
    // plain-milk record is freezer-only; milk is still a fridge food).
    if (rec.p !== undefined && rec.f !== undefined) return rec.p >= rec.f ? 'pantry' : 'fridge';
    return rec.p !== undefined ? 'pantry' : 'fridge';
  }
  const cat = category ?? categorizeByName(name);
  if (!cat) return null;
  if (cat === 'dairy' || cat === 'meat' || cat === 'produce') return 'fridge';
  if (cat === 'frozen') return 'freezer';
  return 'pantry';
}

/** A Date at UTC midnight, `days` from `from`. Shared by the suggestion + the date-stepper UI. */
export function addDaysUTC(from: Date, days: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Suggested expiry as an ISO timestamp (UTC midnight, `days` out), or null when no signal. */
export function suggestExpiryISO(
  opts: { name?: string; category?: string; location?: string },
  now: Date = new Date(),
): string | null {
  const days = suggestShelfLifeDays(opts);
  if (days === null) return null;
  return addDaysUTC(now, days).toISOString();
}
