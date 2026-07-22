// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

// Wire tests for activity_events joining the upload-proxy (Favorites/History
// arc): PUT insert with tenancy, PATCH tombstone (remove a history row), and
// the per-table PATCH allowlist rejecting edits to immutable event fields.
// Same jose/pg mocking pattern as uploadShoppingList.test.ts.

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
const ITEM = 'a1';
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

describe('POST /sync/upload — activity_events', () => {
  it('accepts a PUT insert (cooked) with tenancy on added_by', async () => {
    // authorizePutWrite runs two reads before the upsert: an existing-row
    // lookup (none for a fresh insert) then the household-membership gate.
    const { query } = mockClient([{ rowCount: 0, rows: [] }, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PUT',
            type: 'activity_events',
            id: ITEM,
            data: {
              household_id: HOUSEHOLD,
              kind: 'cooked',
              ref_id: '654959',
              label: 'Pasta With Tuna',
              quantity: 2,
              occurred_at: '2026-06-19T18:30:00.000Z',
              added_by: USER,
              updated_at: 1730000000000,
              deleted: false,
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    const insertCall = query.mock.calls.find((c) =>
      /^INSERT INTO activity_events/i.test(c[0] as string),
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
            type: 'activity_events',
            id: ITEM,
            data: {
              household_id: HOUSEHOLD,
              kind: 'tossed',
              label: 'Spinach',
              occurred_at: '2026-06-19T18:30:00.000Z',
              added_by: 'someone-else',
              updated_at: 1,
            },
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('accepts a PATCH tombstone (remove a history row) and issues a parameterized UPDATE', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'activity_events',
            id: ITEM,
            data: { deleted: true, updated_at: 1730000000000 },
          },
        ],
      });

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) =>
      /^UPDATE activity_events SET/i.test(c[0] as string),
    );
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe(
        'UPDATE activity_events SET deleted = $1, updated_at = $2 WHERE id = $3',
      );
      expect(updateCall[1]).toEqual([true, 1730000000000, ITEM]);
    }
  });

  it('rejects PATCHing a non-allowlisted column (events are immutable)', async () => {
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
            type: 'activity_events',
            id: ITEM,
            data: { label: 'Renamed', updated_at: 1 },
          },
        ],
      });
    expect(res.status).toBe(400);
  });
});
