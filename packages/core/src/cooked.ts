/**
 * "I cooked this" — pure matching + decrement planning.
 *
 * Closes the loop the product is built around: capture → expiry → cook →
 * DECREMENT. When the user confirms they cooked a recipe, we propose which
 * pantry items it consumed (matched against Spoonacular's used-ingredient
 * names) and how each should change. The user always confirms — matching is
 * a suggestion engine, not an authority.
 *
 * Matching is deliberately naive token overlap, normalized the same way on
 * both sides. The singularizer is linguistically imperfect ("hummus" →
 * "hummu") but CONSISTENT — both the ingredient and the pantry name pass
 * through the same normalization, so imperfect stems still match each other.
 * Consistency beats correctness here.
 *
 * Quantity semantics: `unit` is free text in v1 (1 "lb" vs 1 "cup"), so true
 * subtraction is impossible. The honest options offered are: "used up"
 * (tombstone), "used some" (quantity − 1, floored at 1), or "kept" (no
 * change). Precise unit math arrives with the units workstream.
 *
 * Pure functions, no I/O — the mobile sheet renders the plan and applies the
 * writes through PowerSync.
 */

export interface CookCandidate {
  itemId: string;
  itemName: string;
  quantity: number;
  /** The recipe ingredient text that matched this pantry item. */
  matchedIngredient: string;
}

export type CookAction = 'use-up' | 'use-some' | 'use-a-bit' | 'keep';

/**
 * Words too generic to signal a food match on their own — descriptors and
 * connectives that appear in ingredient phrasing ("2 cups all purpose flour",
 * "extra virgin olive oil" — "oil"/"flour" carry the signal, not "extra").
 */
const STOP_TOKENS = new Set([
  'of',
  'and',
  'the',
  'with',
  'all',
  'purpose',
  'extra',
  'virgin',
  'fresh',
  'frozen',
  'large',
  'small',
  'medium',
  'whole',
  'organic',
  'low',
  'fat',
  'free',
  'raw',
  'dried',
  'ground',
]);

/**
 * Naive singularizer. Wrong for irregulars, but applied identically to both
 * sides of every comparison, so stems stay comparable (see module doc).
 */
export function singularizeToken(token: string): string {
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (
    token.length > 4 &&
    (token.endsWith('oes') ||
      token.endsWith('ses') ||
      token.endsWith('xes') ||
      token.endsWith('shes') ||
      token.endsWith('ches'))
  ) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

/** Lowercase → split on non-alphanumerics → drop 1-char noise → singularize → drop stop words. */
export function normalizeFoodTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .map(singularizeToken)
    .filter((t) => !STOP_TOKENS.has(t));
}

/**
 * Propose which pantry items a cooked recipe consumed.
 *
 * An item matches when any of its normalized name tokens appears in an
 * ingredient's normalized token set. Each item is reported at most once
 * (against the first ingredient that matched it); one ingredient may match
 * several items ("chicken broth" can plausibly match "Chicken thighs" — the
 * user keeps the final say in the confirmation sheet). Input order of `items`
 * is preserved.
 */
export function matchCookedItems(
  usedIngredients: string[],
  items: Array<{ id: string; name: string; quantity: number }>,
): CookCandidate[] {
  const ingredients = usedIngredients
    .map((raw) => ({ raw, tokens: new Set(normalizeFoodTokens(raw)) }))
    .filter((i) => i.tokens.size > 0);
  if (ingredients.length === 0) return [];

  const out: CookCandidate[] = [];
  for (const item of items) {
    const tokens = normalizeFoodTokens(item.name);
    if (tokens.length === 0) continue;
    const hit = ingredients.find((ing) => tokens.some((t) => ing.tokens.has(t)));
    if (hit) {
      out.push({
        itemId: item.id,
        itemName: item.name,
        quantity: item.quantity,
        matchedIngredient: hit.raw,
      });
    }
  }
  return out;
}

/** Sensible default for a matched item: multiples decrement, singles finish. */
export function defaultCookAction(quantity: number): Exclude<CookAction, 'keep'> {
  return quantity > 1 ? 'use-some' : 'use-up';
}

/**
 * Quantity after "used some". Never below 1 — an item with some left can't
 * show zero; fully finished is the 'use-up' (tombstone) path instead.
 */
export function decrementedQuantity(quantity: number): number {
  return Math.max(1, quantity - 1);
}

/**
 * One step down the Full → ¾ → ½ → ¼ ladder (the same values the pantry
 * row's manual fill bar uses). Floors at ¼ — "used up" is the honest path to
 * empty, this never implies zero. Undefined (fill tracking is opt-in; never
 * set) behaves as Full, matching the pantry row's display convention.
 *
 * Deliberately does NOT wrap back to Full the way the pantry row's own
 * tap-to-cycle does — that's a manual "I refilled it" reset; cooking a
 * recipe should never accidentally reset an item to full.
 */
export function steppedFillLevel(current: number | undefined): number {
  const level = current ?? 1;
  if (level > 0.75) return 0.75;
  if (level > 0.5) return 0.5;
  return 0.25;
}
