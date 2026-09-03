// Wire tests for DELETE /account — the account-deletion cascade.
// Same jose/pg mocking pattern as the upload/recipe tests; supertest against
// an Express app built from the NestJS-managed AccountController.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock jose BEFORE any import that pulls auth.ts (which reads API_JWKS_URI
// at import time — the env var is set below for that).
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

// Stub fetch for the Supabase admin API call.
const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
vi.stubGlobal('fetch', fetchMock);

// Set env vars the auth middleware needs at import time.
process.env.API_JWKS_URI = 'https://example.com/jwks.json';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// Dynamic import AFTER mocks are in place.
const { default: express } = await import('express');
const { default: request } = await import('supertest');

// We test the controller by mounting it on a plain Express app — same
// pattern as the upload tests, bypassing NestJS bootstrap for speed.
// The controller calls requireUser inline, which the jose mock handles.
const { AccountController } = await import('../modules/account/account.controller.js');

const USER = '00000000-0000-0000-0000-000000000001';
const HOUSEHOLD_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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
  const ctrl = new AccountController();
  // Mount the controller's handler manually for supertest.
  app.delete('/account', (req, res, next) => {
    ctrl.deleteAccount(req).then((result) => res.json(result)).catch(next);
  });
  return app;
}

beforeEach(() => {
  connectMock.mockReset();
  fetchMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /account', () => {
  it('returns 401 without a Bearer token', async () => {
    const res = await request(buildApp()).delete('/account');
    expect(res.status).toBe(401);
  });

  it('cascades: tombstones items, revokes invites, removes memberships, transfers ownership, calls Supabase admin delete', async () => {
    const PANTRY_TOMBSTONED: MockQueryResult = { rowCount: 3, rows: [] };
    const SHOPPING_TOMBSTONED: MockQueryResult = { rowCount: 1, rows: [] };
    const INVITES_REVOKED: MockQueryResult = { rowCount: 2, rows: [] };
    const MEMBERSHIPS: MockQueryResult = {
      rowCount: 1,
      rows: [{ household_id: HOUSEHOLD_A, role: 'owner' }],
    };
    const SUCCESSOR: MockQueryResult = {
      rowCount: 1,
      rows: [{ user_id: '00000000-0000-0000-0000-000000000002' }],
    };
    const TRANSFER: MockQueryResult = { rowCount: 1, rows: [] };
    const REMOVED: MockQueryResult = { rowCount: 1, rows: [] };

    const TOMBSTONED: MockQueryResult = { rowCount: 1, rows: [] };
    const { query } = mockClient([
      PANTRY_TOMBSTONED,
      SHOPPING_TOMBSTONED,
      TOMBSTONED, // favorite_recipes
      TOMBSTONED, // activity_events
      TOMBSTONED, // announcements
      TOMBSTONED, // announcement_reactions
      TOMBSTONED, // push_tokens
      INVITES_REVOKED,
      MEMBERSHIPS,
      SUCCESSOR,
      TRANSFER,
      REMOVED,
    ]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: USER });

    // Verify cascade order via the query calls (ignoring BEGIN/COMMIT).
    const sqls = query.mock.calls
      .map((c) => (c[0] as string).trim())
      .filter((s) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(s));

    expect(sqls[0]).toMatch(/^UPDATE pantry_items SET deleted/i);
    expect(sqls[1]).toMatch(/^UPDATE shopping_list_items SET deleted/i);
    expect(sqls[2]).toMatch(/^UPDATE favorite_recipes SET deleted/i);
    expect(sqls[3]).toMatch(/^UPDATE activity_events SET deleted/i);
    expect(sqls[4]).toMatch(/^UPDATE announcements SET deleted/i);
    expect(sqls[5]).toMatch(/^UPDATE announcement_reactions SET deleted/i);
    expect(sqls[6]).toMatch(/^UPDATE push_tokens SET deleted/i);
    expect(sqls[7]).toMatch(/^UPDATE household_invites SET used_at/i);
    expect(sqls[8]).toMatch(/^SELECT household_id, role FROM user_households/i);
    expect(sqls[9]).toMatch(/^SELECT user_id FROM user_households/i); // successor lookup
    expect(sqls[10]).toMatch(/^UPDATE user_households SET role/i); // transfer
    expect(sqls[11]).toMatch(/^DELETE FROM user_households/i);

    // Supabase admin delete was called.
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, opts] = call as unknown as [string, RequestInit];
    expect(url).toContain(`/auth/v1/admin/users/${USER}`);
    expect(opts.method).toBe('DELETE');
    expect(opts.headers).toHaveProperty('authorization', 'Bearer test-service-key');
  });

  it('handles sole-member household: no successor, no transfer, membership still removed', async () => {
    const { query } = mockClient([
      { rowCount: 0, rows: [] }, // pantry
      { rowCount: 0, rows: [] }, // shopping
      { rowCount: 0, rows: [] }, // favorite_recipes
      { rowCount: 0, rows: [] }, // activity_events
      { rowCount: 0, rows: [] }, // announcements
      { rowCount: 0, rows: [] }, // announcement_reactions
      { rowCount: 0, rows: [] }, // push_tokens
      { rowCount: 0, rows: [] }, // invites
      { rowCount: 1, rows: [{ household_id: HOUSEHOLD_A, role: 'owner' }] }, // memberships
      { rowCount: 0, rows: [] }, // no successor
      { rowCount: 1, rows: [] }, // membership delete
    ]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(200);

    const sqls = query.mock.calls
      .map((c) => (c[0] as string).trim())
      .filter((s) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(s));

    // No transfer UPDATE — just the membership DELETE.
    expect(sqls.some((s) => /^UPDATE user_households SET role/i.test(s))).toBe(false);
    expect(sqls.some((s) => /^DELETE FROM user_households/i.test(s))).toBe(true);
  });

  it('is idempotent: Supabase 404 on already-deleted user is not an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });

    mockClient([
      { rowCount: 0, rows: [] }, // pantry (nothing to tombstone)
      { rowCount: 0, rows: [] }, // shopping
      { rowCount: 0, rows: [] }, // favorite_recipes
      { rowCount: 0, rows: [] }, // activity_events
      { rowCount: 0, rows: [] }, // announcements
      { rowCount: 0, rows: [] }, // announcement_reactions
      { rowCount: 0, rows: [] }, // push_tokens
      { rowCount: 0, rows: [] }, // invites
      { rowCount: 0, rows: [] }, // no memberships
    ]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(200);
  });
});
