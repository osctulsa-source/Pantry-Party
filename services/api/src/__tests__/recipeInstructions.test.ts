// Wire tests for GET /recipes/:id/instructions — the recipe step backfill.
// Same jose-mock pattern as the account/recipe-search tests. The upstream
// Spoonacular call is injected (fetchInstructionsById deps) for the unit-level
// tests and stubbed globally for the controller-level tests, so nothing leaves
// the process.

import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ErrorRequestHandler } from 'express';
import type { RecipeInstructionGroup } from '../routes/recipes.js';

// Mock jose BEFORE any import that pulls auth.ts (which reads API_JWKS_URI at
// import time — set below).
vi.mock('jose', () => {
  return {
    createRemoteJWKSet: () => () => null,
    jwtVerify: vi.fn(async (token: string) => {
      if (typeof token === 'string' && token.startsWith('test:')) {
        const sub = token.slice('test:'.length);
        if (!sub) throw new Error('empty sub');
        return { payload: { sub, aud: 'authenticated' } };
      }
      throw new Error('invalid token');
    }),
  };
});

// Env the import chain needs (auth.ts at import; the controller's default key).
process.env.API_JWKS_URI = 'https://example.com/jwks.json';
process.env.SPOONACULAR_API_KEY = 'test-key';

// A recipe-information payload with structured steps (a blank step + a blank
// ingredient name to prove they're trimmed, plus a tagged step length).
const ANALYZED = {
  analyzedInstructions: [
    {
      name: '',
      steps: [
        { number: 1, step: 'Chop the onion.', ingredients: [{ name: 'onion' }, { name: '' }], equipment: [] },
        { number: 2, step: 'Sauté until soft.', equipment: [{ name: 'pan' }], length: { number: 3, unit: 'minutes' } },
        { number: 3, step: '' }, // blank — dropped
      ],
    },
  ],
};

const ANALYZED_NORMALIZED: RecipeInstructionGroup[] = [
  {
    name: '',
    steps: [
      { number: 1, step: 'Chop the onion.', ingredients: ['onion'], equipment: [], lengthMinutes: null },
      { number: 2, step: 'Sauté until soft.', ingredients: [], equipment: ['pan'], lengthMinutes: 3 },
    ],
  },
];

// Global fetch stub — used only by the controller-level happy-path test (the
// unit-level tests inject their own fetchImpl).
const globalFetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ANALYZED,
}));
vi.stubGlobal('fetch', globalFetchMock);

// Dynamic imports AFTER mocks + env are in place.
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { TtlCache } = await import('../lib/ttlCache.js');
const { FixedWindowRateLimiter } = await import('../lib/rateLimit.js');
const { RecipesController, fetchInstructionsById } = await import(
  '../modules/recipes/recipes.controller.js'
);

const USER = '00000000-0000-0000-0000-000000000001';

type FetchImpl = typeof fetch;

/** A stubbed GET /recipes/{id}/information response. */
function upstreamInfo(body: unknown, status = 200): FetchImpl {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    json: async () => body,
  })) as unknown as FetchImpl;
}

const freshCache = () => new TtlCache<RecipeInstructionGroup[]>({ ttlMs: 60_000, maxEntries: 50 });
const freshLimiter = () => new FixedWindowRateLimiter({ limit: 100, windowMs: 60_000 });

describe('fetchInstructionsById', () => {
  it('normalizes structured analyzedInstructions (same shape as the search proxy)', async () => {
    const fetchImpl = upstreamInfo(ANALYZED);
    const out = await fetchInstructionsById(7, USER, {
      fetchImpl,
      apiKey: () => 'k',
      cache: freshCache(),
      limiter: freshLimiter(),
    });
    expect(out.cached).toBe(false);
    expect(out.instructions).toEqual(ANALYZED_NORMALIZED);
    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/7/information');
    expect(calledUrl).toContain('apiKey=k');
    expect(calledUrl).toContain('includeNutrition=false');
  });

  it('falls back to the free-text instructions string when analyzed steps are absent', async () => {
    const fetchImpl = upstreamInfo({ instructions: '<ol><li>Boil water.</li><li>Add pasta.</li></ol>' });
    const out = await fetchInstructionsById(8, USER, {
      fetchImpl,
      apiKey: () => 'k',
      cache: freshCache(),
      limiter: freshLimiter(),
    });
    expect(out.instructions).toEqual([
      {
        name: '',
        steps: [
          { number: 1, step: 'Boil water.', ingredients: [], equipment: [], lengthMinutes: null },
          { number: 2, step: 'Add pasta.', ingredients: [], equipment: [], lengthMinutes: null },
        ],
      },
    ]);
  });

  it('returns [] for an unknown id (404) — the client keeps its fallback', async () => {
    const out = await fetchInstructionsById(999, USER, {
      fetchImpl: upstreamInfo({}, 404),
      apiKey: () => 'k',
      cache: freshCache(),
      limiter: freshLimiter(),
    });
    expect(out.instructions).toEqual([]);
  });

  it('throws a generic 502 on an upstream error (no upstream details leak)', async () => {
    const err = await fetchInstructionsById(5, USER, {
      fetchImpl: upstreamInfo({ message: 'quota exhausted, internal-detail-xyz' }, 500),
      apiKey: () => 'k',
      cache: freshCache(),
      limiter: freshLimiter(),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(502);
    expect(JSON.stringify((err as HttpException).getResponse())).not.toContain('internal-detail-xyz');
  });

  it('throws 503 when the server-side key is not configured', async () => {
    const fetchImpl = upstreamInfo(ANALYZED);
    const err = await fetchInstructionsById(5, USER, {
      fetchImpl,
      apiKey: () => undefined,
      cache: freshCache(),
      limiter: freshLimiter(),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches by id — a repeat lookup is served without touching the upstream', async () => {
    const fetchImpl = upstreamInfo(ANALYZED);
    const cache = freshCache();
    const limiter = freshLimiter();
    const first = await fetchInstructionsById(11, USER, { fetchImpl, apiKey: () => 'k', cache, limiter });
    const second = await fetchInstructionsById(11, USER, { fetchImpl, apiKey: () => 'k', cache, limiter });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.instructions).toEqual(first.instructions);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rate limits per user on a cache miss with a 429', async () => {
    const fetchImpl = upstreamInfo(ANALYZED);
    const cache = freshCache();
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });
    const first = await fetchInstructionsById(21, USER, { fetchImpl, apiKey: () => 'k', cache, limiter });
    expect(first.cached).toBe(false);
    // A different id → no cache hit → the limiter is consulted → denied.
    const err = await fetchInstructionsById(22, USER, { fetchImpl, apiKey: () => 'k', cache, limiter }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
  });
});

// Error middleware that translates a thrown HttpException into its HTTP status
// — this is what Nest's exception filter does in production; we replicate it so
// supertest sees the real status the controller intends.
const httpExceptionHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpException) {
    res.status(err.getStatus()).json(err.getResponse());
  } else {
    res.status(500).json({ ok: false, error: 'internal' });
  }
};

function buildApp() {
  const app = express();
  app.use(express.json());
  const ctrl = new RecipesController();
  app.get('/recipes/:id/instructions', (req, res, next) => {
    ctrl
      .getInstructions(req.params.id, req)
      .then((r) => res.json(r))
      .catch(next);
  });
  app.use(httpExceptionHandler);
  return app;
}

describe('GET /recipes/:id/instructions', () => {
  it('returns 401 without a Bearer token', async () => {
    const res = await request(buildApp()).get('/recipes/7/instructions');
    expect(res.status).toBe(401);
  });

  it('returns 400 on a non-numeric id', async () => {
    const res = await request(buildApp())
      .get('/recipes/abc/instructions')
      .set('Authorization', `Bearer test:${USER}`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with normalized instructions (happy path, server-side key + global fetch)', async () => {
    const res = await request(buildApp())
      .get('/recipes/900/instructions')
      .set('Authorization', `Bearer test:${USER}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.instructions).toEqual(ANALYZED_NORMALIZED);
  });
});
