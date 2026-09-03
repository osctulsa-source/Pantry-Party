// Legacy API behavior retained under the ADR-009 NestJS migration.

// Wire tests for `brand` joining PATCH_ALLOWED_COLUMNS (brand-entry feature).
// Kept beside upload.test.ts / uploadUnitPatch.test.ts so the feature's
// coverage rides with the feature; same jose/pg module-mocking pattern.

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

function brandPatch(brand: string | null) {
  return {
    crud: [
      {
        op: 'PATCH',
        type: 'pantry_items',
        id: ITEM,
        data: { brand, updated_at: 1730000000000 },
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

describe('POST /sync/upload — PATCH pantry_items.brand', () => {
  it('accepts a brand change and issues a parameterized UPDATE', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(brandPatch('Horizon'));

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe('UPDATE pantry_items SET brand = $1, updated_at = $2 WHERE id = $3');
      expect(updateCall[1]).toEqual(['Horizon', 1730000000000, ITEM]);
    }
  });

  it('accepts clearing the brand (null — empty field saved)', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(brandPatch(null));

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[1]).toEqual([null, 1730000000000, ITEM]);
    }
  });
});
