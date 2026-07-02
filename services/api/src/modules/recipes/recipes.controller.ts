/**
 * RecipesController — native NestJS, the recipe step backfill.
 *
 * GET /recipes/:id/instructions
 *   Lazy step backfill for the in-app recipe detail screen. The Cook feed's
 *   search payload already carries step-by-step instructions for essentially
 *   every recipe (addRecipeInformation + instructionsRequired, PR #143), but a
 *   couple of paths can still hand the detail screen an EMPTY `instructions`:
 *     - a recipe saved to favorites BEFORE the proxy passthrough existed — its
 *       stored payload froze empty; and
 *     - the rare straggler whose bulk-search analyzedInstructions came back
 *       empty even though the recipe has steps when fetched by id.
 *   For those the detail screen calls this endpoint; we fetch the recipe's full
 *   information by id and normalize it with the SAME resolver the search proxy
 *   uses (analyzed → free-text fallback), so the client can render steps.
 *
 * This is the FIRST recipe endpoint on the promoted NestJS backend (ADR-008
 * closed). It deliberately mirrors the search proxy's protections: the
 * server-side SPOONACULAR_API_KEY (never in the client bundle), a per-user rate
 * limiter, and a long-lived cache — recipe instructions are immutable, so a
 * cache hit costs no quota and never touches the limiter.
 *
 * The HTTP-facing logic lives in `fetchInstructionsById`, an injectable helper
 * (fetch / apiKey / cache / limiter) so it can be wire-tested in isolation the
 * way buildRecipesRouter is — the controller just adds auth + id validation.
 */
import { Controller, Get, HttpCode, HttpException, HttpStatus, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireUser, type AuthedRequest } from '../../middleware/auth.js';
import { FixedWindowRateLimiter } from '../../lib/rateLimit.js';
import { TtlCache } from '../../lib/ttlCache.js';
import { resolveInstructions, type RecipeInstructionGroup } from '../../routes/recipes.js';

const SPOONACULAR_BASE = 'https://api.spoonacular.com/recipes';

// Instructions for a given recipe id are immutable, so cache them hard — a hit
// costs no quota and no upstream call. Keyed by id (as a string).
const instructionsCache = new TtlCache<RecipeInstructionGroup[]>({
  ttlMs: 7 * 24 * 3_600_000,
  maxEntries: 1000,
});
// Generous per-user guard: the client only calls this when a detail screen
// opens with no steps (rare), so this protects against a runaway client rather
// than throttling normal use.
const defaultLimiter = new FixedWindowRateLimiter({ limit: 60, windowMs: 10 * 60_000 });

/** The subset of Spoonacular's GET /recipes/{id}/information we read for steps. */
interface RecipeInformation {
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
  instructions?: string;
}

export interface RecipeInstructionsDeps {
  fetchImpl?: typeof fetch;
  /** Lazy key read — missing key degrades to 503, never crashes the service. */
  apiKey?: () => string | undefined;
  cache?: TtlCache<RecipeInstructionGroup[]>;
  limiter?: FixedWindowRateLimiter;
}

/**
 * Fetch + normalize a single recipe's instructions by id. Cache-first (a hit is
 * free and skips the limiter), then rate-limited, then the server-side-keyed
 * upstream call. A 404 (unknown id) resolves to [] so the client keeps its
 * "view original" fallback; any other upstream problem throws a generic 502.
 * Throws HttpException (429/503/502) — the controller and Nest's exception
 * filter translate it to the HTTP response.
 */
export async function fetchInstructionsById(
  id: number,
  userId: string,
  deps: RecipeInstructionsDeps = {},
): Promise<{ instructions: RecipeInstructionGroup[]; cached: boolean }> {
  const cache = deps.cache ?? instructionsCache;
  const limiter = deps.limiter ?? defaultLimiter;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? (() => process.env.SPOONACULAR_API_KEY);

  const cached = cache.get(String(id));
  if (cached) {
    return { instructions: cached, cached: true };
  }

  const decision = limiter.check(userId);
  if (!decision.allowed) {
    throw new HttpException(
      { ok: false, error: 'rate limit exceeded — try again shortly' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  const key = apiKey();
  if (!key) {
    throw new HttpException(
      { ok: false, error: 'recipe lookup is not configured' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  const params = new URLSearchParams({ includeNutrition: 'false', apiKey: key });
  const upstream = await fetchImpl(`${SPOONACULAR_BASE}/${id}/information?${params.toString()}`).catch(
    (err: unknown) => {
      console.error('[api] recipe instructions lookup failed:', err);
      throw new HttpException(
        { ok: false, error: 'recipe lookup upstream failed' },
        HttpStatus.BAD_GATEWAY,
      );
    },
  );

  // 404 = unknown id → no steps. Cache the empty result so we don't re-hit the
  // quota for the same dead id, and let the client keep its fallback.
  if (upstream.status === 404) {
    cache.set(String(id), []);
    return { instructions: [], cached: false };
  }
  if (!upstream.ok) {
    console.error('[api] spoonacular information failed:', upstream.status, upstream.statusText);
    throw new HttpException(
      { ok: false, error: 'recipe lookup upstream failed' },
      HttpStatus.BAD_GATEWAY,
    );
  }

  const info = (await upstream.json()) as RecipeInformation;
  // Same resolver as the search proxy: structured analyzedInstructions first,
  // else parse the free-text `instructions` string.
  const instructions = resolveInstructions({
    analyzedInstructions: info.analyzedInstructions,
    instructions: info.instructions,
  });
  cache.set(String(id), instructions);
  return { instructions, cached: false };
}

@Controller()
export class RecipesController {
  @Get('recipes/:id/instructions')
  @HttpCode(200)
  async getInstructions(
    @Param('id') idParam: string,
    @Req() req: Request,
  ): Promise<{ ok: true; cached: boolean; instructions: RecipeInstructionGroup[] }> {
    // Auth: reuse the Express middleware inline (same pattern as AccountController).
    await new Promise<void>((resolve, reject) => {
      requireUser(req, req.res!, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException({ ok: false, error: 'invalid recipe id' }, HttpStatus.BAD_REQUEST);
    }

    const userId = (req as AuthedRequest).userId;
    const { instructions, cached } = await fetchInstructionsById(id, userId);
    return { ok: true, cached, instructions };
  }
}
