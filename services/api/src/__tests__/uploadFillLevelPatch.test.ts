// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

// Wire tests for `fill_level` joining PATCH_ALLOWED_COLUMNS (fill-level
// feature). Kept beside upload.test.ts / uploadUnitPatch / uploadBrandPatch
// so the feature's coverage rides with the feature; same jose/pg mocking.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const connectMock = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    connect: (...args: unknown[]) => connectMock(...args),
  },
}));

const { uploadRouter } = await import('../routes/upload.js');
const { default: express } = await import('express');
const { default: request } = await import('supertest');

const USER = '00000000-0000-0000-0000-000000000001';
const ITEM = 'p1';
const HOUSEHOLD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type MockQueryResult = { rowCount: number; rows: unknown[] };

function mockClient(steps: MockQueryResult[]): { query: ReturnType<typeof vi.fn> } {
  const queue: MockQueryResult[] = [...steps];
  const query = vi.fn(async (sql: string) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected query: ${sql}`);
    return next;
  });
  connectMock.mockResolvedValueOnce({ query, release: vi.fn() });
  return { query };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(uploadRouter);
  return app;
}

function fillPatch(fillLevel: number | null) {
  return {
    crud: [
      {
        op: 'PATCH',
        type: 'pantry_items',
        id: ITEM,
        data: { fill_level: fillLevel, updated_at: 1730000000000 },
      },
    ],
  };
}

const ROW_FOUND: MockQueryResult = { rowCount: 1, rows: [{ household_id: HOUSEHOLD }] };
const MEMBER: MockQueryResult = { rowCount: 1, rows: [{ '?column?': 1 }] };
const UPDATED: MockQueryResult = { rowCount: 1, rows: [] };

beforeEach(() => {
  connectMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /sync/upload — PATCH pantry_items.fill_level', () => {
  it('accepts a fill_level change and issues a parameterized UPDATE', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(fillPatch(0.5));

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe('UPDATE pantry_items SET fill_level = $1, updated_at = $2 WHERE id = $3');
      expect(updateCall[1]).toEqual([0.5, 1730000000000, ITEM]);
    }
  });

  it('accepts clearing the level (null — stop tracking)', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(fillPatch(null));

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[1]).toEqual([null, 1730000000000, ITEM]);
    }
  });
});
