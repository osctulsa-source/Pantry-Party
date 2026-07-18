/**
 * Staple basics — "back of the bag" cook instructions for base starches that
 * a recipe's own steps sometimes never explain. Spoonacular (and even some
 * curated) recipes often assume "cooked rice" as a given and only script the
 * parts that need real technique (searing the chicken, building the sauce) —
 * the rice/pasta/etc. itself never appears in a single instruction step. When
 * that happens, the recipe detail screen surfaces this as a supplemental note
 * so the dish doesn't stall out on "wait, how do I even cook the rice."
 *
 * Curated data over generation — same philosophy as substitutions.ts and
 * foodKinds.ts: small, predictable, offline, trivially tunable.
 *
 * Deliberately excludes dried beans: "beans" in a recipe's ingredient list is
 * overwhelmingly canned (already cooked) in US home cooking, and canned vs.
 * dried is not reliably distinguishable from the ingredient name alone —
 * telling someone to soak-and-simmer a can of beans would be actively wrong,
 * not just unhelpful, so it's safer to skip beans than guess.
 *
 * Pure functions, no I/O.
 */

import { normalizeFoodTokens } from './cooked.ts';

/** One staple's public info — what the recipe detail screen renders. */
export interface StapleBasics {
  id: string;
  /** Display name ("Rice"). */
  label: string;
  /** The back-of-the-bag cook instructions. */
  instructions: string;
}

interface StapleRule extends StapleBasics {
  /** Whole-ingredient-name forms that count as "this staple, uncooked" (lowercase). */
  nameVariants: string[];
  /** The word most likely used generically in prose ("rice", "pasta"). */
  genericTerm: string;
}

const STAPLE_RULES: StapleRule[] = [
  {
    id: 'rice',
    label: 'Rice',
    genericTerm: 'rice',
    nameVariants: [
      'rice',
      'white rice',
      'brown rice',
      'jasmine rice',
      'basmati rice',
      'arborio rice',
      'wild rice',
      'long grain rice',
      'short grain rice',
      'sushi rice',
    ],
    instructions:
      'Rinse 1 cup rice, add 2 cups water, bring to a boil, cover, reduce heat to low, and simmer about 18 minutes (15 for white, 40–45 for brown). Off heat, rest covered 5 minutes, then fluff with a fork.',
  },
  {
    id: 'pasta',
    label: 'Pasta',
    genericTerm: 'pasta',
    nameVariants: [
      'pasta',
      'spaghetti',
      'penne',
      'rigatoni',
      'fusilli',
      'macaroni',
      'linguine',
      'fettuccine',
      'orzo',
      'egg noodles',
      'angel hair',
      'farfalle',
      'rotini',
      'ziti',
    ],
    instructions:
      'Bring a large pot of well-salted water to a boil. Cook per package directions (usually 8–12 minutes) until al dente, stirring occasionally. Reserve a splash of pasta water before draining.',
  },
  {
    id: 'quinoa',
    label: 'Quinoa',
    genericTerm: 'quinoa',
    nameVariants: ['quinoa', 'white quinoa', 'red quinoa', 'tricolor quinoa'],
    instructions:
      'Rinse 1 cup quinoa, combine with 2 cups water or broth, bring to a boil, then cover and simmer 15 minutes. Remove from heat, rest 5 minutes covered, then fluff with a fork.',
  },
  {
    id: 'couscous',
    label: 'Couscous',
    genericTerm: 'couscous',
    nameVariants: ['couscous', 'pearl couscous', 'israeli couscous'],
    instructions:
      'Bring 1¼ cups water or broth to a boil, stir in 1 cup couscous, cover, and remove from heat. Let sit 5 minutes, then fluff with a fork. (Pearl/Israeli couscous needs ~8–10 minutes of simmering instead, like pasta.)',
  },
];

/** Precomputed once per rule: each name variant's normalized token set + the generic term's tokens. */
const STAPLE_MATCHERS = STAPLE_RULES.map((rule) => ({
  rule,
  variantTokenSets: rule.nameVariants.map((v) => normalizeFoodTokens(v)),
  genericTokens: normalizeFoodTokens(rule.genericTerm),
}));
const MATCHER_BY_ID = new Map(STAPLE_MATCHERS.map((m) => [m.rule.id, m]));

function tokenSetsEqual(a: readonly string[], b: ReadonlySet<string>): boolean {
  return a.length === b.size && a.every((t) => b.has(t));
}

function tokensSubsetOf(needle: readonly string[], haystack: ReadonlySet<string>): boolean {
  return needle.length > 0 && needle.every((t) => haystack.has(t));
}

/**
 * Which curated staples are used in this recipe but never mentioned in any of
 * its own instruction text — i.e. the recipe expects the cook to already know
 * how to prepare them.
 *
 * `ingredientNames` should be the recipe's ingredient names (e.g.
 * `recipe.ingredients.map(i => i.name)` — short, largely-normalized strings).
 * `instructionTexts` should be every instruction step's prose plus its
 * per-step ingredient list, flattened (works identically for Spoonacular and
 * curated recipes, which share the same ingredient/instruction shape).
 */
export function detectUncoveredStaples(
  ingredientNames: readonly string[],
  instructionTexts: readonly string[],
): StapleBasics[] {
  if (ingredientNames.length === 0) return [];

  // Stage 1: which staples does this recipe actually use (as a raw
  // ingredient, not a compound like "rice vinegar" or "cooked rice")?
  const present = new Map<string, { rule: StapleRule; matchedVariantTokens: string[] }>();
  for (const name of ingredientNames) {
    const tokens = normalizeFoodTokens(name);
    if (tokens.length === 0) continue;
    const tokenSet = new Set(tokens);
    for (const { rule, variantTokenSets } of STAPLE_MATCHERS) {
      if (present.has(rule.id)) continue;
      const matchedVariant = variantTokenSets.find((variant) => tokenSetsEqual(variant, tokenSet));
      if (matchedVariant) present.set(rule.id, { rule, matchedVariantTokens: matchedVariant });
    }
  }
  if (present.size === 0) return [];

  // Stage 2: does any step mention it — either by the exact ingredient form
  // ("the spaghetti is done") or the staple's generic term ("cook the pasta")?
  const instructionTokens = new Set(instructionTexts.flatMap((t) => normalizeFoodTokens(t)));
  const uncovered: StapleBasics[] = [];
  for (const { rule, matchedVariantTokens } of present.values()) {
    const genericTokens = MATCHER_BY_ID.get(rule.id)?.genericTokens ?? [];
    const mentioned =
      tokensSubsetOf(matchedVariantTokens, instructionTokens) || tokensSubsetOf(genericTokens, instructionTokens);
    if (!mentioned) uncovered.push({ id: rule.id, label: rule.label, instructions: rule.instructions });
  }
  return uncovered;
}
