/**
 * matchTechnique — maps a cook-mode step's text to a technique glyph.
 *
 * Pure and keyword-based (same precedent as CookModeView's parseMinutes):
 * works for Spoonacular and curated recipes alike. Ordered rules, FIRST RULE
 * that hits wins — order encodes specificity ("roll out" beats the "cut"
 * inside the same sentence), not text position. Negated clauses ("do not
 * stir…") are stripped before matching so warnings can't trigger a glyph.
 * Curated recipes may carry an authored per-step `technique` that overrides
 * all of this — see resolveStepGlyph.
 */
import { STAGES, TECHNIQUES, type Stage, type Technique } from '../../components/brandGlyphs.technique';

/** Kill a negation and the rest of its clause (up to . , or ;). */
const NEGATION = /\b(?:do not|don'?t|avoid|never|no need to|without)\b[^.,;]*/gi;

export const TECHNIQUE_RULES: ReadonlyArray<readonly [Technique, RegExp]> = [
  ['preheat', /\b(?:preheat(?:ing|ed)?|bake[sd]?|baking|roast(?:ing|ed)?|broil(?:ing|ed)?|into the oven)\b/],
  ['grate', /\b(?:grate[sd]?|grating|zest(?:ing|ed)?|shred(?:ding|ded)?)\b/],
  ['mash', /\b(?:mash(?:ing|ed)?|pur[ée]e[sd]?|blend(?:ing|ed)?|blitz(?:ing|ed)?|food processor)\b/],
  ['roll', /\b(?:roll(?:ing|ed|s)? out|rolling pin|flatten(?:ing|ed)?)\b/],
  ['rest', /\b(?:rest(?:ing|ed)?|cool(?:ing|ed)?|chill(?:ing|ed)?|set aside|refrigerate[sd]?|marinate[sd]?|let (?:it |them )?(?:stand|sit)|rise|proof(?:ing|ed)?)\b/],
  ['knead', /\b(?:knead(?:ing|ed)?|fold(?:ing|ed)?|press(?:ing|ed)?|shape[sd]?|shaping|form(?:ing|ed)? into)\b/],
  ['chop', /\b(?:chop(?:ping|ped)?|dice[sd]?|dicing|mince[sd]?|mincing|cube[sd]?|slice[sd]?|slicing|julienne[sd]?|halve[sd]?|quarter(?:ed)?|cut(?:ting)?)\b/],
  ['season', /\b(?:season(?:ing|ed)?|sprinkle[sd]?|sprinkling|garnish(?:ing|ed)?|salt and pepper|dust(?:ing|ed)?)\b/],
  ['flip', /\b(?:flip(?:ping|ped)?|saut[ée](?:ing|ed)?|sear(?:ing|ed)?|brown(?:ing|ed)?|toss(?:ing|ed)?|(?:pan-?)?fry(?:ing)?|fried)\b/],
  ['simmer', /\b(?:simmer(?:ing|ed)?|boil(?:ing|ed)?|poach(?:ing|ed)?|steam(?:ing|ed)?|reduce[sd]? (?:the )?(?:heat|sauce|liquid))\b/],
  ['pour', /\b(?:pour(?:ing|ed)?|drain(?:ing|ed)?|strain(?:ing|ed)?)\b/],
  ['stir', /\b(?:stir(?:ring|red)?|whisk(?:ing|ed)?|beat(?:ing|en)?|mix(?:ing|ed)?|combine[sd]?|whip(?:ping|ped)?)\b/],
];

export function matchTechnique(stepText: string): Technique | null {
  const text = stepText.toLowerCase().replace(NEGATION, ' ');
  for (const [technique, pattern] of TECHNIQUE_RULES) {
    if (pattern.test(text)) return technique;
  }
  return null;
}

const TECHNIQUE_IDS: ReadonlySet<string> = new Set(TECHNIQUES);

/**
 * The hero slot's resolution chain: authored technique → keyword match →
 * stage fallback (spec rule: first step → prep, last → finishing, middle →
 * cooking; a single-step recipe counts as prep). "none" is the authored
 * escape hatch: suppress the matcher, show the stage glyph.
 */
export function resolveStepGlyph(
  authored: string | null | undefined,
  stepText: string,
  stepIdx: number,
  totalSteps: number,
): Technique | Stage {
  const stage: Stage =
    stepIdx <= 0 ? STAGES[0] : stepIdx >= totalSteps - 1 ? STAGES[2] : STAGES[1];
  if (authored === 'none') return stage;
  if (authored && TECHNIQUE_IDS.has(authored)) return authored as Technique;
  return matchTechnique(stepText) ?? stage;
}
