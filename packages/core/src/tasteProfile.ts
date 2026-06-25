/**
 * Taste profile — the flavor-quiz answers that seed "Your Kitchen" and the Cook
 * ranking. Pure + framework-free so it unit-tests without React Native; mobile
 * persists it on-device per household (see useTasteProfile) and the Cook tab
 * blends seedPrefsFromTaste() into the same token-weight engine recipePrefs and
 * buildTasteProfile already use.
 *
 * Phase 1 is a cold-start seed: a brand-new user has no saves/cooks for
 * buildTasteProfile to learn from, so the quiz gives ranking something to go on
 * from day one. Cuisines + flavors nudge ranking; diets + speed are captured for
 * filtering (applied elsewhere), not as nudges.
 */
import { applyPrefEvent, type RecipePrefs } from './recipePrefs.ts';

export type TasteSpeed = 'quick' | 'project';

export interface TasteProfile {
  /** Cuisine slugs the user leans toward (CUISINE_OPTIONS). */
  cuisines: string[];
  /** Flavor-leaning slugs (FLAVOR_OPTIONS). */
  flavors: string[];
  /** Weeknight rhythm — null until chosen. */
  speed: TasteSpeed | null;
  /** Hard dietary lines (DIET_OPTIONS) — applied as filters, not nudges. */
  diets: string[];
  /** ISO timestamp of the last quiz save; '' when never set. */
  updatedAt: string;
}

/** A selectable quiz option: stable `slug` (stored) + display `label`. */
export interface TasteOption {
  slug: string;
  label: string;
}

export const CUISINE_OPTIONS: TasteOption[] = [
  { slug: 'italian', label: 'Italian' },
  { slug: 'mexican', label: 'Mexican' },
  { slug: 'thai', label: 'Thai' },
  { slug: 'indian', label: 'Indian' },
  { slug: 'mediterranean', label: 'Mediterranean' },
  { slug: 'japanese', label: 'Japanese' },
  { slug: 'middle-eastern', label: 'Middle Eastern' },
  { slug: 'chinese', label: 'Chinese' },
  { slug: 'comfort', label: 'BBQ & comfort' },
];

export const FLAVOR_OPTIONS: TasteOption[] = [
  { slug: 'spicy', label: 'Spicy' },
  { slug: 'herby', label: 'Herby & fresh' },
  { slug: 'rich', label: 'Rich & savory' },
  { slug: 'citrus', label: 'Bright & citrusy' },
  { slug: 'smoky', label: 'Smoky' },
  { slug: 'garlicky', label: 'Garlicky' },
  { slug: 'sweet', label: 'Sweet tooth' },
];

export const DIET_OPTIONS: TasteOption[] = [
  { slug: 'vegetarian', label: 'Vegetarian' },
  { slug: 'vegan', label: 'Vegan' },
  { slug: 'gluten-free', label: 'Gluten-free' },
  { slug: 'dairy-free', label: 'Dairy-free' },
  { slug: 'nut-free', label: 'Nut-free' },
];

/** Weeknight-rhythm choices, with a short hint for the quiz cards. */
export const SPEED_OPTIONS: Array<{ slug: TasteSpeed; label: string; hint: string }> = [
  { slug: 'quick', label: 'Quick — 30 min or less', hint: 'Weeknight-friendly, few steps.' },
  { slug: 'project', label: 'I like a project', hint: 'Bring on the weekend cook.' },
];

export const EMPTY_TASTE_PROFILE: TasteProfile = {
  cuisines: [],
  flavors: [],
  speed: null,
  diets: [],
  updatedAt: '',
};

/** True when no taste signal has been given yet (drives the "Set your taste" card). */
export function isTasteProfileEmpty(p: TasteProfile): boolean {
  return (
    p.cuisines.length === 0 &&
    p.flavors.length === 0 &&
    p.diets.length === 0 &&
    p.speed === null
  );
}

/**
 * Representative recipe-TITLE tokens for each cuisine/flavor slug. Cuisine names
 * rarely appear in titles ("Spaghetti Carbonara" never says "italian"), so each
 * pick expands into words that actually show up in titles. A tunable starting
 * set, not a taxonomy — every entry survives tokenizeTitle() (≥3 letters, no
 * stopwords).
 */
const SEED_TOKENS: Record<string, string[]> = {
  // cuisines
  italian: ['pasta', 'pesto', 'parmesan', 'risotto', 'marinara'],
  mexican: ['taco', 'salsa', 'enchilada', 'quesadilla', 'chipotle'],
  thai: ['thai', 'coconut', 'lemongrass', 'peanut', 'basil'],
  indian: ['curry', 'masala', 'tikka', 'paneer', 'dal'],
  mediterranean: ['hummus', 'feta', 'olive', 'tahini', 'pita'],
  japanese: ['miso', 'teriyaki', 'ramen', 'soy', 'sesame'],
  'middle-eastern': ['shawarma', 'falafel', 'harissa', 'couscous', 'tahini'],
  chinese: ['ginger', 'soy', 'sesame', 'hoisin', 'szechuan'],
  comfort: ['bbq', 'grilled', 'cheddar', 'smoked', 'mac'],
  // flavors
  spicy: ['spicy', 'chili', 'sriracha', 'jalapeno'],
  herby: ['herb', 'basil', 'cilantro', 'parsley'],
  rich: ['creamy', 'cheesy', 'butter', 'braised'],
  citrus: ['lemon', 'lime', 'citrus', 'orange'],
  smoky: ['smoked', 'smoky', 'paprika', 'chipotle'],
  garlicky: ['garlic', 'garlicky'],
  sweet: ['honey', 'caramel', 'maple', 'cinnamon'],
};

/**
 * Convert a TasteProfile into a RecipePrefs nudge map, reusing the SAME
 * token-weight engine as learned prefs — so the Cook ranking can simply add
 * scoreTitle(learned) + scoreTitle(seed). Each cuisine/flavor pick nudges its
 * representative tokens up by a 'like'. Diets + speed are filters, not nudges,
 * so they never appear here. Empty (or all-unknown) profile → {}.
 */
export function seedPrefsFromTaste(profile: TasteProfile): RecipePrefs {
  let prefs: RecipePrefs = {};
  for (const slug of [...profile.cuisines, ...profile.flavors]) {
    const tokens = SEED_TOKENS[slug];
    if (!tokens) continue;
    // applyPrefEvent tokenizes a "title"; a space-joined token list tokenizes
    // back to exactly those words.
    prefs = applyPrefEvent(prefs, tokens.join(' '), 'like');
  }
  return prefs;
}
