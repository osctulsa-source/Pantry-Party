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

const { buildRecipesRouter, parsePlainInstructions } = await import('../routes/recipes.js');
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
  missedIngredients: [
    { name: 'maple syrup', aisle: 'Breakfast', amount: 0.5 },
    { name: '' },
  ],
  healthScore: 72,
  vegetarian: true,
  vegan: false,
  glutenFree: false,
  cuisines: ['american'], // extra upstream noise — must be trimmed away
  // detail-screen payload (rides along via addRecipeInformation + fillIngredients)
  readyInMinutes: 25,
  servings: 4,
  sourceUrl: 'https://foodista.com/banana-pancakes',
  sourceName: 'Foodista',
  summary: '<b>Banana pancakes</b> are delicious. <a href="x">source</a>',
  extendedIngredients: [
    { id: 1, name: 'banana', original: '2 bananas', amount: 2, unit: '', aisle: 'Produce', image: 'banana.png' },
    { name: 'milk', original: '1 cup milk', amount: 1, unit: 'cup' },
    { name: '', original: '' }, // blank — dropped
  ],
  analyzedInstructions: [
    {
      name: '',
      steps: [
        { number: 1, step: 'Mash the bananas.', ingredients: [{ name: 'banana' }, { name: '' }], equipment: [] },
        {
          number: 2,
          step: 'Cook on a hot griddle.',
          equipment: [{ name: 'griddle' }],
          length: { number: 5, unit: 'minutes' },
        },
        { number: 3, step: '' }, // blank — dropped
      ],
    },
  ],
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
        missedIngredients: [{ name: 'maple syrup' }],
        healthScore: 72,
        vegetarian: true,
        vegan: false,
        glutenFree: false,
        // detail-screen fields — cuisines and per-ingredient/step noise dropped
        readyInMinutes: 25,
        servings: 4,
        sourceUrl: 'https://foodista.com/banana-pancakes',
        sourceName: 'Foodista',
        summary: '<b>Banana pancakes</b> are delicious. <a href="x">source</a>',
        ingredients: [
          { name: 'banana', original: '2 bananas', amount: 2, unit: '' },
          { name: 'milk', original: '1 cup milk', amount: 1, unit: 'cup' },
        ],
        instructions: [
          {
            name: '',
            steps: [
              { number: 1, step: 'Mash the bananas.', ingredients: ['banana'], equipment: [], lengthMinutes: null },
              { number: 2, step: 'Cook on a hot griddle.', ingredients: [], equipment: ['griddle'], lengthMinutes: 5 },
            ],
          },
        ],
      },
    ]);

    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('apiKey=test-key');
    expect(calledUrl).toContain('includeIngredients=Bananas');
    expect(calledUrl).toContain('type=breakfast');
    expect(calledUrl).toContain('offset=8');
    expect(calledUrl).toContain('fillIngredients=true');
    expect(calledUrl).toContain('addRecipeInformation=true');
    // Every card must be able to show steps in-app, so the search only asks
    // for recipes that have instructions.
    expect(calledUrl).toContain('instructionsRequired=true');
  });

  it('falls back to free-text instructions when analyzedInstructions is absent (the foodista case)', async () => {
    const fetchImpl = upstreamOk([
      {
        id: 42,
        title: 'Foodista Soup',
        image: 'https://img.example/soup.jpg',
        // No analyzedInstructions at all — only the free-text method.
        instructions: '<ol><li>Chop the onion.</li><li>Simmer for 20 minutes.</li></ol>',
      },
    ]);
    const res = await request(buildApp({ fetchImpl }))
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.results[0].instructions).toEqual([
      {
        name: '',
        steps: [
          { number: 1, step: 'Chop the onion.', ingredients: [], equipment: [], lengthMinutes: null },
          { number: 2, step: 'Simmer for 20 minutes.', ingredients: [], equipment: [], lengthMinutes: null },
        ],
      },
    ]);
  });

  it('prefers analyzedInstructions over the free-text fallback when both exist', async () => {
    const fetchImpl = upstreamOk([
      { ...UPSTREAM_RESULT, instructions: 'IGNORE ME. This free text should never be used.' },
    ]);
    const res = await request(buildApp({ fetchImpl }))
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.results[0].instructions).toEqual([
      {
        name: '',
        steps: [
          { number: 1, step: 'Mash the bananas.', ingredients: ['banana'], equipment: [], lengthMinutes: null },
          { number: 2, step: 'Cook on a hot griddle.', ingredients: [], equipment: ['griddle'], lengthMinutes: 5 },
        ],
      },
    ]);
  });

  it('retries without instructionsRequired when the strict search returns nothing', async () => {
    // First pass (with instructionsRequired) is empty; the relaxed retry finds one.
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        results: /instructionsRequired=true/.test(url) ? [] : [UPSTREAM_RESULT],
      }),
    })) as unknown as FetchImpl;

    const res = await request(buildApp({ fetchImpl }))
      .post('/recipes/search')
      .set('Authorization', `Bearer test:${USER}`)
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].id).toBe(7);
    // Exactly two upstream calls: the strict search, then the relaxed retry.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as string;
    expect(secondUrl).not.toContain('instructionsRequired=true');
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

// Unit coverage for the free-text fallback parser. Mirrors the shapes
// Spoonacular returns when analyzedInstructions is empty: <ol>/<li> lists,
// <p> blocks, numbered prose (newline- or inline-separated), bare sentences,
// and junk that should yield nothing.
describe('parsePlainInstructions (free-text fallback)', () => {
  const step = (number: number, s: string) => ({
    number,
    step: s,
    ingredients: [] as string[],
    equipment: [] as string[],
    lengthMinutes: null as number | null,
  });
  const group = (...steps: ReturnType<typeof step>[]) => [{ name: '', steps }];

  it('parses an <ol>/<li> list into numbered steps', () => {
    expect(
      parsePlainInstructions('<ol><li>Mash the bananas.</li><li>Cook on a griddle.</li></ol>'),
    ).toEqual(group(step(1, 'Mash the bananas.'), step(2, 'Cook on a griddle.')));
  });

  it('splits <p> blocks into steps', () => {
    expect(parsePlainInstructions('<p>Whisk the eggs.</p><p>Fold in the flour.</p>')).toEqual(
      group(step(1, 'Whisk the eggs.'), step(2, 'Fold in the flour.')),
    );
  });

  it('splits newline-separated numbered text and decodes entities', () => {
    const out = parsePlainInstructions('1. Preheat to 350&deg;.\n2. Mix flour &amp; sugar.\n3. Bake.');
    expect((out[0]?.steps ?? []).map((s) => s.step)).toEqual([
      'Preheat to 350°.',
      'Mix flour & sugar.',
      'Bake.',
    ]);
  });

  it('splits a single blob on inline numbered markers', () => {
    const out = parsePlainInstructions('1) Do this. 2) Do that. 3) Done.');
    expect((out[0]?.steps ?? []).map((s) => s.step)).toEqual(['Do this.', 'Do that.', 'Done.']);
  });

  it('strips a step marker that lives inside the list item', () => {
    expect(parsePlainInstructions('<ol><li>1. Mash bananas</li><li>2. Cook</li></ol>')).toEqual(
      group(step(1, 'Mash bananas'), step(2, 'Cook')),
    );
  });

  it('falls back to sentence splitting when there are no markers', () => {
    const out = parsePlainInstructions('Preheat the oven. Mix the ingredients. Bake until golden.');
    expect((out[0]?.steps ?? []).map((s) => s.step)).toEqual([
      'Preheat the oven.',
      'Mix the ingredients.',
      'Bake until golden.',
    ]);
  });

  it('keeps a single short instruction as one step with empty metadata', () => {
    expect(parsePlainInstructions('Grill the salmon for ten minutes.')).toEqual(
      group(step(1, 'Grill the salmon for ten minutes.')),
    );
  });

  it('returns [] for empty, whitespace, undefined, or tags-only input', () => {
    expect(parsePlainInstructions('')).toEqual([]);
    expect(parsePlainInstructions('   \n  ')).toEqual([]);
    expect(parsePlainInstructions(undefined)).toEqual([]);
    expect(parsePlainInstructions('<p></p><br>')).toEqual([]);
  });
});
