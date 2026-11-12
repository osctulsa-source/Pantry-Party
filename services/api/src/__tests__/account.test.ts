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
  // Nest's exception filter isn't mounted here; mirror its status mapping.
  app.use((err: unknown, _req: unknown, res: { status(c: number): { json(b: unknown): void } }, _next: unknown) => {
    const status = (err as { getStatus?: () => number }).getStatus?.() ?? 500;
    res.status(status).json({ ok: false });
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

  // The fixed prefix of the cascade, in order: six tombstone+anonymize
  // UPDATEs, push-token delete, invite delete, invite detach, analytics detach.
  const PREFIX: MockQueryResult[] = Array.from({ length: 10 }, () => ({ rowCount: 0, rows: [] }));
  const OK: MockQueryResult = { rowCount: 1, rows: [] };

  function sqlsOf(query: ReturnType<typeof vi.fn>): string[] {
    return query.mock.calls
      .map((c) => (c[0] as string).trim())
      .filter((s) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(s));
  }

  it('cascades: anonymizes rows, removes tokens/invites, transfers ownership, calls Supabase admin delete', async () => {
    const { query } = mockClient([
      ...PREFIX,
      { rowCount: 1, rows: [{ household_id: HOUSEHOLD_A, role: 'owner' }] }, // memberships
      { rowCount: 1, rows: [{ user_id: '00000000-0000-0000-0000-000000000002' }] }, // successor
      OK, // transfer
      OK, // membership delete
      OK, // households.created_by handover
    ]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: USER });

    const sqls = sqlsOf(query);
    const NIL = '00000000-0000-0000-0000-000000000000';
    for (const [i, table, col] of [
      [0, 'pantry_items', 'added_by'],
      [1, 'shopping_list_items', 'added_by'],
      [2, 'favorite_recipes', 'added_by'],
      [3, 'activity_events', 'added_by'],
      [4, 'announcements', 'created_by'],
      [5, 'announcement_reactions', 'user_id'],
    ] as const) {
      expect(sqls[i]).toBe(
        `UPDATE ${table} SET deleted = true, ${col} = $1, updated_at = $2 WHERE ${col} = $3`,
      );
      // The attribution column is overwritten with the nil UUID.
      expect((query.mock.calls.find((c) => c[0] === sqls[i]) as unknown[])[1]).toEqual([
        NIL,
        expect.any(Number),
        USER,
      ]);
    }
    expect(sqls[6]).toMatch(/^DELETE FROM push_tokens/i);
    expect(sqls[7]).toMatch(/^DELETE FROM household_invites WHERE created_by/i);
    expect(sqls[8]).toMatch(/^UPDATE household_invites SET used_by = NULL/i);
    expect(sqls[9]).toMatch(/^UPDATE analytics_events SET user_id = NULL/i);
    expect(sqls[10]).toMatch(/^SELECT household_id, role FROM user_households/i);
    expect(sqls[11]).toMatch(/^SELECT user_id FROM user_households/i); // successor lookup
    expect(sqls[12]).toMatch(/^UPDATE user_households SET role/i); // transfer
    expect(sqls[13]).toMatch(/^DELETE FROM user_households/i);
    expect(sqls[14]).toMatch(/^UPDATE households h/i);

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
      ...PREFIX,
      { rowCount: 1, rows: [{ household_id: HOUSEHOLD_A, role: 'owner' }] }, // memberships
      { rowCount: 0, rows: [] }, // no successor
      OK, // membership delete
      OK, // households.created_by handover
    ]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(200);

    const sqls = sqlsOf(query);
    // No transfer UPDATE — just the membership DELETE.
    expect(sqls.some((s) => /^UPDATE user_households SET role/i.test(s))).toBe(false);
    expect(sqls.some((s) => /^DELETE FROM user_households/i.test(s))).toBe(true);
  });

  it('is idempotent: Supabase 404 on already-deleted user is not an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });
    mockClient([...PREFIX, { rowCount: 0, rows: [] }, OK]); // no memberships, households update

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(200);
  });

  it('fails (502) when Supabase cannot delete the auth user — never reports a deletion that did not happen', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' });
    mockClient([...PREFIX, { rowCount: 0, rows: [] }, OK]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(502);
  });

  it('fails (502) when the Supabase admin call throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    mockClient([...PREFIX, { rowCount: 0, rows: [] }, OK]);

    const res = await request(buildApp())
      .delete('/account')
      .set('Authorization', `Bearer test:${USER}`);

    expect(res.status).toBe(502);
  });
});
