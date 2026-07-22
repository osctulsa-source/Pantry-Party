// Legacy API behavior retained under the ADR-009 NestJS migration.

// Wire tests for shopping_list_items joining the upload-proxy (August
// shopping-list arc): PUT insert, PATCH check-off, and the per-table PATCH
// allowlist rejecting pantry-only columns. Same jose/pg mocking pattern.

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
const ITEM = 's1';
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

describe('POST /sync/upload — shopping_list_items', () => {
  it('accepts a PUT insert with tenancy on added_by', async () => {
    const { query } = mockClient([UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PUT',
            type: 'shopping_list_items',
            id: ITEM,
            data: {
              household_id: HOUSEHOLD,
              name: 'Oat milk',
              quantity: 1,
              checked: false,
              source: 'low',
              added_by: USER,
              added_at: '2026-06-12T00:00:00.000Z',
              updated_at: 1730000000000,
              deleted: false,
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    const insertCall = query.mock.calls.find((c) =>
      /^INSERT INTO shopping_list_items/i.test(c[0] as string),
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
            type: 'shopping_list_items',
            id: ITEM,
            data: { household_id: HOUSEHOLD, name: 'X', added_by: 'someone-else', updated_at: 1 },
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('accepts a PATCH check-off and issues a parameterized UPDATE on the right table', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'shopping_list_items',
            id: ITEM,
            data: { checked: true, updated_at: 1730000000000 },
          },
        ],
      });

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) =>
      /^UPDATE shopping_list_items SET/i.test(c[0] as string),
    );
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe(
        'UPDATE shopping_list_items SET checked = $1, updated_at = $2 WHERE id = $3',
      );
      expect(updateCall[1]).toEqual([true, 1730000000000, ITEM]);
    }
  });

  it('rejects PATCHing a column not in the shopping allowlist (fill_level is pantry-only)', async () => {
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
            type: 'shopping_list_items',
            id: ITEM,
            data: { fill_level: 0.5, updated_at: 1 },
          },
        ],
      });
    expect(res.status).toBe(400);
  });
});
