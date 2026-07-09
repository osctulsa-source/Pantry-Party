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
// (e.g. "juice") are checked before broad ones (e.g. "orange") so "orange juice"
// resolves to beverage, not produce.
const NAME_CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(milk|cream|yogurt|yoghurt|cheese|butter|kefir)\b/, 'dairy'],
  [/\b(chicken|beef|pork|turkey|fish|salmon|shrimp|bacon|sausage|steak|mince|meat)\b/, 'meat'],
  [/\b(bread|bagel|tortilla|bun|roll|muffin|croissant|pastry|cake)\b/, 'bakery'],
  [/\b(juice|soda|beer|wine|kombucha|cola|lemonade|drink|beverage)\b/, 'beverage'],
  [/\b(frozen|ice cream|freezer)\b/, 'frozen'],
  [/\b(lettuce|spinach|kale|tomato|tomatoes|berry|berries|banana|apple|orange|grape|carrot|broccoli|cucumber|onion|herb|cilantro|parsley|avocado|mushroom|produce|fruit|veg|vegetable|salad)\b/, 'produce'],
  [/\b(flour|sugar|salt|rice|pasta|oil|sauce|ketchup|mustard|mayo|vinegar|honey|oats|cereal|bean|beans|canned|stock|broth|spice|pepper|baking|yeast|peanut|jam|tea|coffee|pantry|dry)\b/, 'pantry'],
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

/** A Date at UTC midnight, `days` from `from`. Shared by the suggestion + the date-stepper UI. */
export function addDaysUTC(from: Date, days: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Suggested expiry as an ISO timestamp (UTC midnight, `days` out), or null when no signal. */
export function suggestExpiryISO(opts: { name?: string; category?: string }, now: Date = new Date()): string | null {
  const days = suggestShelfLifeDays(opts);
  if (days === null) return null;
  return addDaysUTC(now, days).toISOString();
}
