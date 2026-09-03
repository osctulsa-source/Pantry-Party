// Legacy Express recipe-search router mounted by the NestJS bootstrap (ADR-009).
// The response was widened over time to carry recipe detail and instruction
// data without extra upstream calls. Preserve that wire contract until this
// route migrates to RecipesModule.

import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../middleware/auth.js';
import { FixedWindowRateLimiter } from '../lib/rateLimit.js';
import { TtlCache } from '../lib/ttlCache.js';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes';

/**
 * Why this endpoint exists (external review §2.8, both CRITICAL):
 *  1. The Spoonacular API key used to ship in the client bundle
 *     (EXPO_PUBLIC_SPOONACULAR_API_KEY) — extractable in minutes, and one bad
 *     actor burns the shared daily quota for every user. The key now lives
 *     only here, server-side (SPOONACULAR_API_KEY).
 *  2. The service had zero rate limiting. Searches are now limited per user
 *     (JWT sub), and identical searches are served from a 24h cache without
 *     touching the quota or the limiter.
 *
 * Body mirrors the mobile client's searchByMeal options. The response is the
 * trimmed complexSearch shape the client maps: results[].usedIngredients
 * carries names for the "I cooked this" matcher, results[].missedIngredients
 * carries names for "Add N missing to list" (shopping arc S2b-B), and — for the
 * in-app recipe detail screen — each result also carries readyInMinutes,
 * servings, source attribution, an HTML summary, the full ingredient list
 * (with amounts), and grouped step-by-step instructions. All of those ride
 * along for free: addRecipeInformation + fillIngredients are already requested
 * upstream; we'd been discarding everything but the card fields.
 */
const BodySchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(60),
  type: z.enum(['breakfast', 'main course', 'dessert', 'snack']).optional(),
  number: z.number().int().min(1).max(12).optional(),
  offset: z.number().int().min(0).max(900).optional(),
});

/** One ingredient line for the detail screen: `original` is the display string. */
export interface RecipeIngredient {
  name: string;
  original: string;
  amount: number | null;
  unit: string;
}

/** One instruction step. Carries its own ingredients/equipment/length for the cook-along. */
export interface RecipeStep {
  number: number;
  step: string;
  /** Ingredient names used in THIS step — the cook-along "for this step: ..." line. */
  ingredients: string[];
  /** Equipment names this step needs — feeds mise en place + per-step hints. */
  equipment: string[];
  /** Step duration in minutes when Spoonacular tags one — drives in-step timers; null otherwise. */
  lengthMinutes: number | null;
}

/** A (possibly named) block of numbered steps, e.g. "For the sauce". */
export interface RecipeInstructionGroup {
  name: string;
  steps: RecipeStep[];
}

export interface TrimmedRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  likes: number;
  usedIngredients: Array<{ name: string }>;
  missedIngredients: Array<{ name: string }>;
  /** Spoonacular 0–100 healthiness score; null when the API omits it. */
  healthScore: number | null;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  // --- detail-screen fields (recipe-detail arc) -------------------------
  /** Minutes to make; null when the API omits it. */
  readyInMinutes: number | null;
  /** Servings the recipe yields; null when the API omits it. */
  servings: number | null;
  /** Original recipe URL — shown as attribution (Spoonacular terms). '' if absent. */
  sourceUrl: string;
  /** Human-readable source/site name for attribution. '' if absent. */
  sourceName: string;
  /** HTML summary — stripped client-side before display. '' if absent. */
  summary: string;
  /** Full ingredient list with display strings + amounts. */
  ingredients: RecipeIngredient[];
  /** Grouped, numbered step-by-step instructions. */
  instructions: RecipeInstructionGroup[];
}

export interface UpstreamResult {
  id?: number;
  title?: string;
  image?: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  likes?: number;
  usedIngredients?: Array<{ name?: string }>;
  missedIngredients?: Array<{ name?: string }>;
  healthScore?: number;
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  readyInMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  sourceName?: string;
  summary?: string;
  /**
   * Free-text method (often HTML). Spoonacular returns this alongside
   * analyzedInstructions; many aggregator recipes have ONLY this. Used as the
   * step fallback when analyzedInstructions is empty (see resolveInstructions).
   */
  instructions?: string;
  extendedIngredients?: Array<{ name?: string; original?: string; amount?: number; unit?: string }>;
  analyzedInstructions?: Array<{
    name?: string;
    steps?: Array<{
      number?: number;
      step?: string;
      ingredients?: Array<{ name?: string }>;
      equipment?: Array<{ name?: string }>;
      length?: { number?: number; unit?: string };
    }>;
  }>;
}
interface UpstreamResponse {
  results?: UpstreamResult[];
}

/** Names only — aisle/amount and other upstream noise trimmed, blanks dropped. */
function trimIngredientNames(list: Array<{ name?: string }> | undefined): Array<{ name: string }> {
  return (list ?? []).map((i) => ({ name: i.name ?? '' })).filter((i) => i.name.length > 0);
}

/** Full ingredient list — keeps the display string + amount, drops aisle/image/id noise. */
function trimIngredients(list: UpstreamResult['extendedIngredients']): RecipeIngredient[] {
  return (list ?? [])
    .map((i) => ({
      name: i.name ?? '',
      original: i.original ?? '',
      amount: typeof i.amount === 'number' ? i.amount : null,
      unit: i.unit ?? '',
    }))
    .filter((i) => i.name.length > 0 || i.original.length > 0);
}

/** Convert Spoonacular's {number,unit} step length to minutes; null when absent/unknown. */
function stepLengthMinutes(length: { number?: number; unit?: string } | undefined): number | null {
  if (!length || typeof length.number !== 'number') return null;
  const unit = (length.unit ?? '').toLowerCase();
  if (unit.startsWith('hour')) return Math.round(length.number * 60);
  if (unit.startsWith('min')) return length.number;
  return null;
}

/** Names only — drops Spoonacular's id/image/localizedName noise, blanks removed. */
function trimNames(list: Array<{ name?: string }> | undefined): string[] {
  return (list ?? []).map((i) => i.name ?? '').filter((n) => n.length > 0);
}

/**
 * Grouped steps. Keeps number + text AND the per-step ingredients / equipment /
 * length the cook-along uses (inline amounts, mise en place, in-step timers) —
 * these ride along in analyzedInstructions; we'd been discarding them.
 */
function trimInstructions(list: UpstreamResult['analyzedInstructions']): RecipeInstructionGroup[] {
  return (list ?? [])
    .map((group) => ({
      name: group.name ?? '',
      steps: (group.steps ?? [])
        .map((s) => ({
          number: typeof s.number === 'number' ? s.number : 0,
          step: s.step ?? '',
          ingredients: trimNames(s.ingredients),
          equipment: trimNames(s.equipment),
          lengthMinutes: stepLengthMinutes(s.length),
        }))
        .filter((s) => s.step.length > 0),
    }))
    .filter((g) => g.steps.length > 0);
}

/**
 * Decode the handful of HTML entities Spoonacular emits in free-text
 * instructions and strip tags, turning block-level closes into line breaks.
 * Deliberately small — a best-effort cleaner, not a full HTML parser.
 */
function decodeAndStrip(raw: string): string {
  return raw
    .replace(/<\/(p|div|li|ol|ul|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&deg;/gi, '°')
    .replace(/&#(\d+);/g, (_m, d: string) => {
      const n = Number(d);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    });
}

/** Strip a leading step marker like "1.", "2)", "Step 3:", "1 -". */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*(?:step\s*)?\d{1,3}\s*[.)\-:–]\s*/i, '').trim();
}

/**
 * Best-effort fallback when a recipe has no analyzedInstructions but DOES carry
 * a free-text `instructions` string (common for aggregator sources). Produces a
 * single unnamed group of bare numbered steps — NO per-step ingredients /
 * equipment / time, since those only exist in the structured payload, so the
 * detail screen renders a clean numbered list with no chips. Returns [] when
 * there's nothing usable, so the client keeps its "view original" empty state.
 *
 * Strategy (most-reliable shapes first): explicit <li> items → newline-split
 * text → a single blob split on numbered markers (≥2) → sentence boundaries.
 */
export function parsePlainInstructions(raw: string | undefined): RecipeInstructionGroup[] {
  if (!raw || !raw.trim()) return [];

  let parts: string[];
  if (/<li[\s>]/i.test(raw)) {
    parts = Array.from(raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) =>
      decodeAndStrip(m[1] ?? ''),
    );
  } else {
    const text = decodeAndStrip(raw).replace(/[ \t]+/g, ' ');
    const byLine = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (byLine.length > 1) {
      parts = byLine;
    } else {
      const blob = byLine[0] ?? '';
      const markerCount = (blob.match(/(?:^|\s)(?:step\s*)?\d{1,3}\s*[.)\-:–]\s/gi) ?? []).length;
      if (markerCount >= 2) {
        parts = blob.split(/(?:^|\s)(?:step\s+)?\d{1,3}\s*[.)\-:–]\s+/i);
      } else {
        parts = blob.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
      }
    }
  }

  const steps: RecipeStep[] = parts
    .map((p) => stripLeadingNumber(p))
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((step, i) => ({ number: i + 1, step, ingredients: [], equipment: [], lengthMinutes: null }));

  return steps.length === 0 ? [] : [{ name: '', steps }];
}

/**
 * Structured steps when Spoonacular analyzed them; otherwise a best-effort
 * parse of the free-text `instructions` string. Both come from the SAME
 * upstream response, so this adds zero quota and no additional request.
 */
export function resolveInstructions(r: UpstreamResult): RecipeInstructionGroup[] {
  const analyzed = trimInstructions(r.analyzedInstructions);
  return analyzed.length > 0 ? analyzed : parsePlainInstructions(r.instructions);
}

export interface RecipesRouterOptions {
  limiter?: FixedWindowRateLimiter;
  cache?: TtlCache<TrimmedRecipe[]>;
  fetchImpl?: typeof fetch;
  /** Lazy key read — missing key degrades to 503, never crashes the service. */
  apiKey?: () => string | undefined;
}

export function buildRecipesRouter(opts: RecipesRouterOptions = {}): ReturnType<typeof Router> {
  const limiter = opts.limiter ?? new FixedWindowRateLimiter({ limit: 30, windowMs: 10 * 60_000 });
  const cache = opts.cache ?? new TtlCache<TrimmedRecipe[]>({ ttlMs: 24 * 3_600_000, maxEntries: 500 });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey ?? (() => process.env.SPOONACULAR_API_KEY);

  const router: ReturnType<typeof Router> = Router();

  router.post('/recipes/search', requireUser, async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'invalid payload', issues: parsed.error.issues });
      return;
    }
    const { ingredients, type, number = 8, offset = 0 } = parsed.data;

    // Cache first: hits cost us nothing, so they don't count against the
    // user's rate limit either.
    const cacheKey = [
      [...ingredients].map((i) => i.toLowerCase()).sort().join(','),
      type ?? 'any',
      number,
      offset,
    ].join('|');
    const cached = cache.get(cacheKey);
    if (cached) {
      res.json({ ok: true, cached: true, results: cached });
      return;
    }

    const userId = (req as AuthedRequest).userId;
    const decision = limiter.check(userId);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({ ok: false, error: 'rate limit exceeded — try again shortly' });
      return;
    }

    const key = apiKey();
    if (!key) {
      // SPOONACULAR_API_KEY unset (e.g. fresh local stack) — degrade loudly
      // but harmlessly instead of crashing at boot.
      res.status(503).json({ ok: false, error: 'recipe search is not configured' });
      return;
    }

    const params = new URLSearchParams({
      includeIngredients: ingredients.join(','),
      sort: 'max-used-ingredients',
      fillIngredients: 'true',
      ignorePantry: 'true',
      // Recipe info rides along so every result carries healthScore + diet
      // booleans (the mobile Healthy toggle re-ranks CLIENT-side from the same
      // cached response) AND the detail-screen fields (ingredients, steps,
      // time, servings, source) — all already in this payload, zero extra cost.
      addRecipeInformation: 'true',
      // Only surface recipes that HAVE instructions. The whole promise of the
      // Cook feed is that any recipe you open shows step-by-step steps in-app,
      // so the (few) recipes Spoonacular has no instructions for at all are
      // filtered out upstream — we never lead a user to a "view original" dead
      // end. Combined with resolveInstructions' analyzed→free-text fallback
      // (ADR-008 NOTE 3), essentially every card now carries steps.
      instructionsRequired: 'true',
      number: String(number),
      apiKey: key,
    });
    if (type) params.set('type', type);
    if (offset) params.set('offset', String(offset));

    // One upstream complexSearch → its raw results, or throw for a clean 502.
    const runSearch = async (p: URLSearchParams): Promise<UpstreamResult[]> => {
      const upstream = await fetchImpl(`${SPOONACULAR_BASE}/complexSearch?${p.toString()}`);
      if (!upstream.ok) {
        // Log details server-side; clients get a generic message (the old
        // client surfaced raw upstream bodies — review §2.5 flagged it).
        console.error('[api] spoonacular upstream failed:', upstream.status, upstream.statusText);
        throw new Error('recipe search upstream not ok');
      }
      const data = (await upstream.json()) as UpstreamResponse;
      return data.results ?? [];
    };

    try {
      let upstreamResults = await runSearch(params);
      // instructionsRequired can, for a very sparse pantry, over-filter the
      // search to nothing. Never show an empty Cook feed purely because of the
      // filter: retry once without it. This extra upstream call happens ONLY
      // when the strict search found nothing, so normal searches still cost
      // exactly one call (and the relaxed result is cached under the same key).
      if (upstreamResults.length === 0) {
        const relaxed = new URLSearchParams(params);
        relaxed.delete('instructionsRequired');
        upstreamResults = await runSearch(relaxed);
      }
      const results: TrimmedRecipe[] = upstreamResults.map((r) => ({
        id: r.id ?? 0,
        title: r.title ?? '',
        image: r.image ?? '',
        usedIngredientCount: r.usedIngredientCount ?? 0,
        missedIngredientCount: r.missedIngredientCount ?? 0,
        likes: r.likes ?? 0,
        usedIngredients: trimIngredientNames(r.usedIngredients),
        missedIngredients: trimIngredientNames(r.missedIngredients),
        healthScore: typeof r.healthScore === 'number' ? r.healthScore : null,
        vegetarian: r.vegetarian ?? false,
        vegan: r.vegan ?? false,
        glutenFree: r.glutenFree ?? false,
        readyInMinutes: typeof r.readyInMinutes === 'number' ? r.readyInMinutes : null,
        servings: typeof r.servings === 'number' ? r.servings : null,
        sourceUrl: r.sourceUrl ?? '',
        sourceName: r.sourceName ?? '',
        summary: r.summary ?? '',
        ingredients: trimIngredients(r.extendedIngredients),
        instructions: resolveInstructions(r),
      }));
      cache.set(cacheKey, results);
      res.json({ ok: true, cached: false, results });
    } catch (err) {
      console.error('[api] recipes search failed:', err);
      res.status(502).json({ ok: false, error: 'recipe search upstream failed' });
    }
  });

  return router;
}

export const recipesRouter: ReturnType<typeof Router> = buildRecipesRouter();
