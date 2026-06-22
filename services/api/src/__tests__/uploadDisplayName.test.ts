// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

// Wire tests for user_households.display_name joining the upload-proxy
// (Display-names arc): a member may PATCH display_name on their OWN membership
// row, but NOT on a co-member's (per-row tenancy by user_id, not household
// membership), and only display_name is editable. Same jose/pg mocking pattern
// as uploadShoppingList.test.ts.

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
const OTHER = '00000000-0000-0000-0000-000000000002';
const ITEM = 'uh1'; // a user_households row id

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

const UPDATED: MockQueryResult = { rowCount: 1, rows: [] };

beforeEach(() => {
  connectMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /sync/upload — user_households.display_name', () => {
  it('accepts a PATCH of display_name on the caller’s OWN membership', async () => {
    // SELECT user_id returns the caller, then the UPDATE.
    const { query } = mockClient([{ rowCount: 1, rows: [{ user_id: USER }] }, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'user_households',
            id: ITEM,
            data: { display_name: 'Alex' },
          },
        ],
      });

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) =>
      /^UPDATE user_households SET/i.test(c[0] as string),
    );
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe('UPDATE user_households SET display_name = $1 WHERE id = $2');
      expect(updateCall[1]).toEqual(['Alex', ITEM]);
    }
  });

  it('rejects PATCHing a co-member’s membership row (tenancy is the row’s user_id)', async () => {
    // The target row belongs to someone else — 403 before any UPDATE.
    const { query } = mockClient([{ rowCount: 1, rows: [{ user_id: OTHER }] }]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'user_households',
            id: ITEM,
            data: { display_name: 'Hijacked' },
          },
        ],
      });

    expect(res.status).toBe(403);
    const updateCall = query.mock.calls.find((c) =>
      /^UPDATE user_households SET/i.test(c[0] as string),
    );
    expect(updateCall).toBeUndefined();
  });

  it('rejects PATCHing a non-allowlisted column (only display_name is editable)', async () => {
    // The allowlist check runs inside the transaction before any query.
    mockClient([]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send({
        crud: [
          {
            op: 'PATCH',
            type: 'user_households',
            id: ITEM,
            data: { role: 'owner' },
          },
        ],
      });
    expect(res.status).toBe(400);
  });
});
