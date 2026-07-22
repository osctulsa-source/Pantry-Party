// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

// Wire tests for favorite_recipes joining the upload-proxy (Favorites/History
// arc): PUT insert with tenancy, PATCH tombstone (un-save), and the per-table
// PATCH allowlist rejecting non-deleted edits (favorites are immutable
// snapshots). Same jose/pg mocking pattern as uploadShoppingList.test.ts.

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
const ITEM = 'f1';
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

const ROW_FOUND: MockQueryResult = { rowCount: 1, rows: [{ household_id: HOUSEHOLD }] };
const MEMBER: MockQueryResult = { rowCount: 1, rows: [{ '?column?': 1 }] };
const UPDATED: MockQueryResult = { rowCount: 1, rows: [] };

beforeEach(() => {
  connectMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /sync/upload — favorite_recipes', () => {
  it('accepts a PUT insert with tenancy on added_by', async () => {
    // MEMBER = the household-membership gate (authorizePutWrite) that now runs
    // before every PUT upsert; UPDATED = the INSERT itself.
    const { query } = mockClient([MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PUT',
            type: 'favorite_recipes',
            id: ITEM,
            data: {
              household_id: HOUSEHOLD,
              recipe_id: 654959,
              title: 'Pasta With Tuna',
              image: 'https://img.spoonacular.com/recipes/654959.jpg',
              ready_minutes: 45,
              health_score: 19,
              payload: '{"id":654959,"title":"Pasta With Tuna"}',
              added_by: USER,
              added_at: '2026-06-19T00:00:00.000Z',
              updated_at: 1730000000000,
              deleted: false,
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    const insertCall = query.mock.calls.find((c) =>
      /^INSERT INTO favorite_recipes/i.test(c[0] as string),
    );
    expect(insertCall).toBeDefined();
  });

  it('rejects a PUT whose added_by is not the JWT sub (tenancy)', async () => {
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PUT',
            type: 'favorite_recipes',
            id: ITEM,
            data: {
              household_id: HOUSEHOLD,
              recipe_id: 1,
              title: 'X',
              payload: '{}',
              added_by: 'someone-else',
              updated_at: 1,
            },
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('accepts a PATCH tombstone (un-save) and issues a parameterized UPDATE', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'favorite_recipes',
            id: ITEM,
            data: { deleted: true, updated_at: 1730000000000 },
          },
        ],
      });

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) =>
      /^UPDATE favorite_recipes SET/i.test(c[0] as string),
    );
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe(
        'UPDATE favorite_recipes SET deleted = $1, updated_at = $2 WHERE id = $3',
      );
      expect(updateCall[1]).toEqual([true, 1730000000000, ITEM]);
    }
  });

  it('rejects PATCHing a non-allowlisted column (favorites are immutable snapshots)', async () => {
    // The allowlist check runs inside the transaction, so a (never-queried)
    // client must still exist for connect/BEGIN/ROLLBACK.
    mockClient([]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'favorite_recipes',
            id: ITEM,
            data: { title: 'Renamed', updated_at: 1 },
          },
        ],
      });
    expect(res.status).toBe(400);
  });
});
