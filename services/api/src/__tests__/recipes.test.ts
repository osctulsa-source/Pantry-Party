// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

// Wire-level tests for POST /recipes/search: auth, validation, rate limiting,
// caching, upstream trimming, and failure hygiene. jose is module-mocked the
// same way upload.test.ts does it; the upstream Spoonacular call is an
// injected fetchImpl (buildRecipesRouter), so nothing leaves the process.

import { describe, expect, it, vi } from 'vitest';

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

const { buildRecipesRouter } = await import('../routes/recipes.js');
const { FixedWindowRateLimiter } = await import('../lib/rateLimit.js');
const { TtlCache } = await import('../lib/ttlCache.js');
const { default: express } = await import('express');
const { default: request } = await import('supertest');

const USER = '00000000-0000-0000-0000-000000000001';

type FetchImpl = typeof fetch;

function upstreamOk(results: unknown[]): FetchImpl {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ results }),
  })) as unknown as FetchImpl;
}

function buildApp(opts: Parameters<typeof buildRecipesRouter>[0] = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    buildRecipesRouter({
      apiKey: () => 'test-key',
      ...opts,
    }),
  );
  return app;
}

const BODY = { ingredients: ['Bananas', 'Whole milk'], number: 8 };

const UPSTREAM_RESULT = {
  id: 7,
  title: 'Banana pancakes',
  image: 'https://img.example/banana.jpg',
  usedIngredientCount: 2,
  missedIngredientCount: 1,
  likes: 11,
  usedIngredients: [
    { name: 'banana', aisle: 'Produce', amount: 2 },
    { name: 'milk', aisle: 'Dairy' },
    { name: '' },
  ],
  healthScore: 72,
  vegetarian: true,
  vegan: false,
  glutenFree: false,
  cuisines: ['american'], // extra upstream noise — must be trimmed away
};

describe('POST /recipes/search', () => {
  it('returns 401 without a Bearer token', async () => {
    const fetchImpl = upstreamOk([]);
    const res = await request(buildApp({ fetchImpl })).post('/recipes/search').send(BODY);
    expect(res.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid body', async () => {
    const fetchImpl = upstreamOk([]);
    const app = buildApp({ fetchImpl });
    const empty = await request(app)
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send({ ingredients: [] });
    expect(empty.status).toBe(400);

    const badType = await request(app)
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send({ ingredients: ['eggs'], type: 'midnight snack' });
    expect(badType.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('proxies upstream with the server-side key and trims the response', async () => {
    const fetchImpl = upstreamOk([UPSTREAM_RESULT]);
    const res = await request(buildApp({ fetchImpl }))
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send({ ...BODY, type: 'breakfast', offset: 8 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cached).toBe(false);
    expect(res.body.results).toEqual([
      {
        id: 7,
        title: 'Banana pancakes',
        image: 'https://img.example/banana.jpg',
        usedIngredientCount: 2,
        missedIngredientCount: 1,
        likes: 11,
        // names only — aisle/amount trimmed, empty names dropped
        usedIngredients: [{ name: 'banana' }, { name: 'milk' }],
        healthScore: 72,
        vegetarian: true,
        vegan: false,
        glutenFree: false,
      },
    ]);

    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('apiKey=test-key');
    expect(calledUrl).toContain('includeIngredients=Bananas');
    expect(calledUrl).toContain('type=breakfast');
    expect(calledUrl).toContain('offset=8');
    expect(calledUrl).toContain('fillIngredients=true');
    expect(calledUrl).toContain('addRecipeInformation=true');
  });

  it('serves identical searches from cache — one upstream call, no quota burn', async () => {
    const fetchImpl = upstreamOk([UPSTREAM_RESULT]);
    const app = buildApp({ fetchImpl });

    const first = await request(app)
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);
    const second = await request(app)
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);

    expect(first.body.cached).toBe(false);
    expect(second.body.cached).toBe(true);
    expect(second.body.results).toEqual(first.body.results);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rate limits per user with a Retry-After header (cache hits exempt)', async () => {
    const fetchImpl = upstreamOk([UPSTREAM_RESULT]);
    const app = buildApp({
      fetchImpl,
      limiter: new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000 }),
      cache: new TtlCache({ ttlMs: 60_000, maxEntries: 10 }),
    });
    const send = (ingredients: string[]) =>
      request(app)
        .post('/recipes/search')
        .set('Authorization', `Bearer test:${USER}`)
        .send({ ingredients });

    expect((await send(['a'])).status).toBe(200);
    expect((await send(['b'])).status).toBe(200);
    const third = await send(['c']);
    expect(third.status).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    // A repeat of an already-cached search still succeeds — cache before limiter.
    expect((await send(['a'])).status).toBe(200);
    expect((await send(['a'])).body.cached).toBe(true);
  });

  it('returns 503 when the server-side key is not configured', async () => {
    const fetchImpl = upstreamOk([]);
    const res = await request(buildApp({ fetchImpl, apiKey: () => undefined }))
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);
    expect(res.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps upstream failure to a generic 502 — no upstream details leak', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      json: async () => ({ message: 'quota exhausted, internal-detail-xyz' }),
    })) as unknown as FetchImpl;

    const res = await request(buildApp({ fetchImpl }))
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('internal-detail-xyz');
    expect(res.body.error).toMatch(/upstream failed/);
  });
});
