/**
 * Open Food Facts categories_tags → app category (DEFAULT_SHELF_LIFE keys).
 *
 * OFF tags are locale-prefixed slugs ("en:carbonated-drinks"). We strip the
 * prefix and run ordered keyword rules over ALL of a product's tags — first
 * rule with any hit wins. Ordering mirrors NAME_CATEGORY_RULES' philosophy:
 * preservation/processing intents (frozen, canned, dried) outrank the food
 * word, so canned corn stays pantry and frozen vegetables stay frozen.
 * Returns null rather than guessing; callers fall back to name inference.
 */

const OFF_CATEGORY_RULES: Array<[keywords: string[], category: string]> = [
  [['frozen-foods', 'ice-creams'], 'frozen'],
  [['canned-foods', 'dried-products', 'dried-fruits', 'pickled', 'preserves', 'jams'], 'pantry'],
  [['dairies', 'cheeses', 'yogurts', 'milks', 'butters', 'creams', 'fermented-milk-products'], 'dairy'],
  [['meats', 'poultry', 'seafood', 'fishes', 'charcuterie', 'meals-with-meat'], 'meat'],
  [['breads', 'pastries', 'viennoiseries', 'cakes', 'biscuits-and-cakes'], 'bakery'],
  [
    ['beverages', 'waters', 'sodas', 'juices', 'fruit-based-beverages', 'coffees', 'teas', 'energy-drinks', 'alcoholic-beverages', 'boissons'],
    'beverage',
  ],
  [['fruits', 'vegetables', 'fresh-fruits', 'fresh-vegetables'], 'produce'],
  [
    ['condiments', 'sauces', 'cereals-and-potatoes', 'pastas', 'snacks', 'sweet-snacks', 'salty-snacks', 'spreads', 'groceries'],
    'pantry',
  ],
];

/** keyword matches a slug exactly or as a hyphen-bounded segment run. */
function slugMatches(slug: string, keyword: string): boolean {
  return (
    slug === keyword ||
    slug.startsWith(`${keyword}-`) ||
    slug.endsWith(`-${keyword}`) ||
    slug.includes(`-${keyword}-`)
  );
}

export function categoryFromOffTags(tags: readonly string[]): string | null {
  const slugs = tags.map((t) => t.slice(t.indexOf(':') + 1).toLowerCase());
  for (const [keywords, category] of OFF_CATEGORY_RULES) {
    if (slugs.some((slug) => keywords.some((k) => slugMatches(slug, k)))) return category;
  }
  return null;
}
