/**
 * foodKinds — guided specificity for item entry (pure data + matchers).
 *
 * When someone types a generic food ("pasta"), the Add/Edit forms offer its
 * common KINDS (penne, spaghetti…) and seed BRAND suggestions, as skippable
 * chips. The chosen kind folds into the item NAME itself ("Penne pasta") —
 * no schema change, the safe-merge dedup stays honest (different kinds never
 * merge), search keeps working, and recipe matching actually improves with
 * more specific ingredient names.
 *
 * Word order matters and varies by food: pasta kinds lead ("Penne pasta")
 * while chicken kinds trail ("Chicken breasts") — each guide carries an
 * `order` flag and both composing and detecting refined names respect it.
 * Kinds that don't fit a guide's single order are deliberately excluded
 * (e.g. "Ground" on chicken) — the taxonomy is data, trivially extended.
 *
 * Matching is whole-name only, normalized through the SAME singularizer as
 * the cook matcher (consistency beats correctness — see cooked.ts):
 *   "Pasta"        → pasta guide, no active kind
 *   "pastas"       → pasta guide (plural-tolerant)
 *   "Penne pasta"  → pasta guide, active kind Penne (chips stay visible,
 *                    selected — tap again to undo, tap another to switch)
 *   "Pasta sauce"  → no match (refinement never fires on compound names)
 *
 * Brands here are SEEDS (common US brands per category) — the UI ranks the
 * household's own learned brands first and fills remaining slots from these.
 * English-only for now per the standing i18n deferral; everything routes
 * through these few pure functions, so localization stays contained.
 */

import { singularizeToken } from './cooked.ts';

export interface FoodGuide {
  /** Canonical generic name, lowercase ("pasta"). */
  food: string;
  /** Where the kind sits in the composed name: "Penne pasta" vs "Chicken breasts". */
  order: 'kind-first' | 'food-first';
  /** Common kinds, display-cased. */
  kinds: string[];
  /** Seed brand suggestions (learned household brands rank ahead of these). */
  brands: string[];
}

export const FOOD_GUIDES: FoodGuide[] = [
  {
    food: 'pasta',
    order: 'kind-first',
    kinds: ['Penne', 'Spaghetti', 'Rigatoni', 'Fusilli', 'Macaroni', 'Linguine', 'Orzo', 'Lasagna'],
    brands: ['Barilla', 'De Cecco', 'Ronzoni', 'Banza'],
  },
  {
    food: 'rice',
    order: 'kind-first',
    kinds: ['White', 'Brown', 'Jasmine', 'Basmati', 'Arborio', 'Wild'],
    brands: ['Mahatma', 'Lundberg', 'Nishiki', "Ben's Original"],
  },
  {
    food: 'milk',
    order: 'kind-first',
    kinds: ['Whole', '2%', '1%', 'Skim', 'Oat', 'Almond', 'Soy', 'Lactose-free'],
    brands: ['Horizon', 'Organic Valley', 'Oatly', 'Silk', 'Fairlife'],
  },
  {
    food: 'cheese',
    order: 'kind-first',
    kinds: ['Cheddar', 'Mozzarella', 'Parmesan', 'Swiss', 'Feta', 'Goat'],
    brands: ['Tillamook', 'Kraft', 'Sargento', 'BelGioioso'],
  },
  {
    food: 'bread',
    order: 'kind-first',
    kinds: ['Sourdough', 'Whole wheat', 'White', 'Multigrain', 'Rye', 'Brioche'],
    brands: ["Dave's Killer Bread", 'Sara Lee', 'Oroweat', 'Wonder'],
  },
  {
    food: 'beans',
    order: 'kind-first',
    kinds: ['Black', 'Pinto', 'Kidney', 'Cannellini', 'Garbanzo', 'Refried'],
    brands: ['Goya', "Bush's", 'S&W'],
  },
  {
    food: 'yogurt',
    order: 'kind-first',
    kinds: ['Greek', 'Plain', 'Vanilla', 'Strawberry', 'Skyr'],
    brands: ['Chobani', 'Fage', 'Oikos', "Siggi's"],
  },
  {
    food: 'flour',
    order: 'kind-first',
    kinds: ['All-purpose', 'Bread', 'Whole wheat', 'Almond', 'Gluten-free'],
    brands: ['King Arthur', 'Gold Medal', "Bob's Red Mill"],
  },
  {
    food: 'oil',
    order: 'kind-first',
    kinds: ['Olive', 'Vegetable', 'Canola', 'Avocado', 'Coconut', 'Sesame'],
    brands: ['Bertolli', 'California Olive Ranch', 'Chosen Foods'],
  },
  {
    food: 'butter',
    order: 'kind-first',
    kinds: ['Salted', 'Unsalted', 'Plant-based'],
    brands: ['Kerrygold', "Land O'Lakes", 'Challenge'],
  },
  {
    food: 'eggs',
    order: 'kind-first',
    kinds: ['Large', 'Extra large', 'Free-range', 'Organic'],
    brands: ["Eggland's Best", 'Vital Farms', 'Happy Egg'],
  },
  {
    food: 'tomatoes',
    order: 'kind-first',
    kinds: ['Diced', 'Crushed', 'Whole peeled', 'Cherry', 'Roma'],
    brands: ['San Marzano', 'Muir Glen', "Hunt's", 'Cento'],
  },
  {
    food: 'chicken',
    order: 'food-first',
    kinds: ['Breasts', 'Thighs', 'Wings', 'Drumsticks'],
    brands: ['Perdue', 'Tyson', 'Foster Farms'],
  },
  {
    food: 'coffee',
    order: 'kind-first',
    kinds: ['Ground', 'Whole bean', 'Instant', 'Decaf'],
    brands: ["Peet's", 'Starbucks', 'Folgers', 'Lavazza'],
  },
  {
    food: 'tea',
    order: 'kind-first',
    kinds: ['Black', 'Green', 'Herbal', 'Chamomile', 'Earl Grey'],
    brands: ['Twinings', 'Bigelow', 'Celestial Seasonings'],
  },
  {
    food: 'juice',
    order: 'kind-first',
    kinds: ['Orange', 'Apple', 'Grape', 'Cranberry'],
    brands: ['Tropicana', 'Simply', 'Ocean Spray'],
  },
  {
    food: 'salsa',
    order: 'kind-first',
    kinds: ['Mild', 'Medium', 'Hot', 'Verde'],
    brands: ['Pace', 'Herdez', 'Tostitos'],
  },
  // Produce guides carry no seed brands (fresh produce isn't branded) — the UI
  // simply shows fewer/zero brand chips, which is correct. Their real value is
  // the variety row: a distinct set to log ("Fuji apples", "Concord grapes"),
  // which sharpens recipe matching AND powers the variety collection.
  {
    food: 'grapes',
    order: 'kind-first',
    kinds: ['Red', 'Green', 'Black', 'Concord', 'Cotton Candy', 'Champagne'],
    brands: [],
  },
  {
    food: 'apples',
    order: 'kind-first',
    kinds: ['Fuji', 'Gala', 'Honeycrisp', 'Granny Smith', 'Red Delicious', 'Braeburn'],
    brands: [],
  },
  {
    food: 'peppers',
    order: 'kind-first',
    kinds: ['Bell', 'Jalapeno', 'Serrano', 'Poblano', 'Habanero', 'Banana'],
    brands: [],
  },
];

/** Lowercase, trim, collapse whitespace, singularize each token — applied
 *  identically to both sides of every comparison. */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(singularizeToken)
    .join(' ');
}

function composedName(guide: FoodGuide, kind: string): string {
  return guide.order === 'food-first' ? `${guide.food} ${kind}` : `${kind} ${guide.food}`;
}

export interface GuideMatch {
  guide: FoodGuide;
  /** Set when the name is already a refined form ("Penne pasta" → "Penne"). */
  activeKind: string | null;
}

/**
 * Whole-name matcher: returns the guide for a generic food name, or for a
 * name already refined with one of its kinds (so the chip row stays visible
 * and selected after refinement). Compound names ("pasta sauce") never match.
 */
export function guideFor(name: string): GuideMatch | undefined {
  const key = normKey(name);
  if (!key) return undefined;
  for (const guide of FOOD_GUIDES) {
    if (key === normKey(guide.food)) return { guide, activeKind: null };
    for (const kind of guide.kinds) {
      if (key === normKey(composedName(guide, kind))) return { guide, activeKind: kind };
    }
  }
  return undefined;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Penne" + pasta → "Penne pasta"; "Breasts" + chicken → "Chicken breasts". */
export function makeRefinedName(guide: FoodGuide, kind: string): string {
  if (guide.order === 'food-first') return `${capitalize(guide.food)} ${kind.toLowerCase()}`;
  return `${kind} ${guide.food}`;
}

/** The un-refined display name ("Pasta") — used to undo a kind selection. */
export function plainName(guide: FoodGuide): string {
  return capitalize(guide.food);
}
