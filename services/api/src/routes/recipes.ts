// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.
//
//    ADR-008 NOTE: /recipes/search is this service's FOURTH endpoint — the
//    promotion trigger has fired. This ships as the LAST Express addition;
//    the next endpoint starts life on the promoted backend instead.

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
 * trimmed complexSearch shape the client already maps (results[].usedIngredients
 * carries names for the "I cooked this" matcher).
 */
const BodySchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(80)).min(1).max(60),
  type: z.enum(['breakfast', 'main course', 'dessert', 'snack']).optional(),
  number: z.number().int().min(1).max(12).optional(),
  offset: z.number().int().min(0).max(900).optional(),
});

export interface TrimmedRecipe {
  id: number;
  title: string;
  image: string;
  usedIngredientCount: number;
  missedIngredientCount: number;
  likes: number;
  usedIngredients: Array<{ name: string }>;
}

interface UpstreamResult {
  id?: number;
  title?: string;
  image?: string;
  usedIngredientCount?: number;
  missedIngredientCount?: number;
  likes?: number;
  usedIngredients?: Array<{ name?: string }>;
}
interface UpstreamResponse {
  results?: UpstreamResult[];
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
      number: String(number),
      apiKey: key,
    });
    if (type) params.set('type', type);
    if (offset) params.set('offset', String(offset));

    try {
      const upstream = await fetchImpl(`${SPOONACULAR_BASE}/complexSearch?${params.toString()}`);
      if (!upstream.ok) {
        // Log details server-side; clients get a generic message (the old
        // client surfaced raw upstream bodies — review §2.5 flagged it).
        console.error('[api] spoonacular upstream failed:', upstream.status, upstream.statusText);
        res.status(502).json({ ok: false, error: 'recipe search upstream failed' });
        return;
      }
      const data = (await upstream.json()) as UpstreamResponse;
      const results: TrimmedRecipe[] = (data.results ?? []).map((r) => ({
        id: r.id ?? 0,
        title: r.title ?? '',
        image: r.image ?? '',
        usedIngredientCount: r.usedIngredientCount ?? 0,
        missedIngredientCount: r.missedIngredientCount ?? 0,
        likes: r.likes ?? 0,
        usedIngredients: (r.usedIngredients ?? [])
          .map((i) => ({ name: i.name ?? '' }))
          .filter((i) => i.name.length > 0),
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
