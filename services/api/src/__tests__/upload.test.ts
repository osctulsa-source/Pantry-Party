// Legacy API behavior retained under the ADR-009 NestJS migration.

// Two layers of coverage here:
//   1. Pure unit tests for validateCrudEntry / buildUpsertSql (the PUT path).
//   2. Wire-level tests for the PATCH path through POST /sync/upload, with jose
//      and the pg pool module-mocked so the suite never touches a real JWKS
//      endpoint or database. PATCH tenancy reads the target row, so a pure test
//      can't cover it — we drive the real route + middleware instead.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock calls are hoisted above imports, so these run before upload.js (which
// transitively imports the auth middleware → jose, and the pg pool) is loaded.
vi.mock('jose', () => {
  // Any token of shape "test:<userId>" is a valid JWT with that sub. Anything
  // else throws — exercising the real 401 branch in requireUser.
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

const { buildUpsertSql, validateCrudEntry, uploadRouter } = await import('../routes/upload.js');
const { default: express } = await import('express');
const { default: request } = await import('supertest');

const USER = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';
const ITEM = 'p1';
const HOUSEHOLD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('validateCrudEntry', () => {
  it('accepts a well-formed household PUT for the signed-in user', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'households',
        id: 'h1',
        data: { name: 'My Pantry', created_by: USER },
      },
      USER,
    );
    expect(result).toEqual({
      ok: true,
      table: 'households',
      columns: ['id', 'name', 'created_by'],
      values: ['h1', 'My Pantry', USER],
    });
  });

  it('rejects a household PUT whose created_by does not match the JWT sub', () => {
    const result = validateCrudEntry(
      { op: 'PUT', type: 'households', id: 'h1', data: { name: 'X', created_by: OTHER } },
      USER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tenancy.*created_by/);
  });

  it('rejects a user_households PUT whose user_id does not match the JWT sub', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'user_households',
        id: 'm1',
        data: { user_id: OTHER, household_id: 'h1', role: 'owner' },
      },
      USER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tenancy.*user_id/);
  });

  it('rejects non-PUT ops (validateCrudEntry is the PUT path only)', () => {
    for (const op of ['PATCH', 'DELETE'] as const) {
      const result = validateCrudEntry({ op, type: 'households', id: 'h1' }, USER);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects an unknown table', () => {
    const result = validateCrudEntry({ op: 'PUT', type: 'shopping_lists', id: 'x' }, USER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown table/);
  });

  it('drops columns not in the allowlist (defense against client schema drift)', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'households',
        id: 'h1',
        data: { name: 'X', created_by: USER, mystery_column: 'should-be-dropped' },
      },
      USER,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns).not.toContain('mystery_column');
  });

  it('accepts a pantry_items PUT and only the columns we allow', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'pantry_items',
        id: 'p1',
        data: {
          household_id: 'h1',
          name: 'Eggs',
          quantity: 12,
          location: 'fridge',
          added_at: '2026-01-01T00:00:00.000Z',
          source: 'manual',
          added_by: USER,
          updated_at: 1730000000000,
          deleted: 0,
        },
      },
      USER,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns).toContain('quantity');
      expect(result.columns).toContain('added_by');
      expect(result.values[result.columns.indexOf('added_by')]).toBe(USER);
    }
  });
});

describe('buildUpsertSql', () => {
  it('builds an INSERT … ON CONFLICT (id) DO UPDATE for multi-column inserts', () => {
    const { sql, placeholders } = buildUpsertSql('shopping_list_items', ['id', 'name', 'checked']);
    expect(sql).toBe(
      'INSERT INTO shopping_list_items (id, name, checked) ' +
        'VALUES ($1, $2, $3) ' +
        'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, checked = EXCLUDED.checked',
    );
    expect(placeholders).toBe(3);
  });

  it.each(['households', 'user_households'])(
    'never updates ownership rows on conflict (%s is insert-only)',
    (table) => {
      const { sql } = buildUpsertSql(table, ['id', 'name', 'created_by']);
      expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING$/);
    },
  );

  it('falls back to DO NOTHING when only id is present', () => {
    const { sql } = buildUpsertSql('households', ['id']);
    expect(sql).toBe('INSERT INTO households (id) VALUES ($1) ON CONFLICT (id) DO NOTHING');
  });
});

type MockQueryResult = { rowCount: number; rows: unknown[] };
type QueryStep = MockQueryResult | Error;

/**
 * Fake PoolClient that answers the route's queries in order. BEGIN/COMMIT/
 * ROLLBACK are intercepted and always succeed without consuming a step, so the
 * steps array only describes the meaningful queries we care about.
 */
function mockClient(steps: QueryStep[]): { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } {
  const queue: QueryStep[] = [...steps];
  const query = vi.fn(async (sql: string) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected query: ${sql}`);
    if (next instanceof Error) throw next;
    return next;
  });
  const release = vi.fn();
  connectMock.mockResolvedValueOnce({ query, release });
  return { query, release };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(uploadRouter);
  return app;
}

function patchPayload(data: Record<string, unknown>, opts: { type?: string; id?: string } = {}) {
  return {
    crud: [{ op: 'PATCH', type: opts.type ?? 'pantry_items', id: opts.id ?? ITEM, data }],
  };
}

// SELECT household_id → row exists in HOUSEHOLD; SELECT 1 → caller is a member.
const ROW_FOUND: MockQueryResult = { rowCount: 1, rows: [{ household_id: HOUSEHOLD }] };
const MEMBER: MockQueryResult = { rowCount: 1, rows: [{ '?column?': 1 }] };
const UPDATED: MockQueryResult = { rowCount: 1, rows: [] };

beforeEach(() => {
  connectMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /sync/upload — PATCH pantry_items', () => {
  it('returns 401 when no Bearer token is sent', async () => {
    const res = await request(buildApp())
      .post('/sync/upload')
      .send(patchPayload({ name: 'Whole milk' }));
    expect(res.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 200 and issues a parameterized UPDATE on the happy path (edit)', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(patchPayload({ name: 'Whole milk', quantity: 2 }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, applied: 1 });

    const allSql = query.mock.calls.map((c) => c[0] as string);
    expect(allSql.some((s) => /^\s*BEGIN/i.test(s))).toBe(true);
    expect(allSql.some((s) => /^\s*COMMIT/i.test(s))).toBe(true);

    const updateCall = query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe('UPDATE pantry_items SET name = $1, quantity = $2 WHERE id = $3');
      expect(updateCall[1]).toEqual(['Whole milk', 2, ITEM]);
    }
  });

  it('returns 200 for a tombstone delete (deleted = 1)', async () => {
    const { query } = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(patchPayload({ deleted: 1, updated_at: 1730000000000 }));

    expect(res.status).toBe(200);
    const updateCall = query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(updateCall).toBeDefined();
    if (updateCall) {
      expect(updateCall[0]).toBe('UPDATE pantry_items SET deleted = $1, updated_at = $2 WHERE id = $3');
      expect(updateCall[1]).toEqual([1, 1730000000000, ITEM]);
    }
  });

  it('returns 403 when the item belongs to a household the caller is not in', async () => {
    // Row exists, but the membership lookup finds nothing for this user.
    mockClient([ROW_FOUND, { rowCount: 0, rows: [] }]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${OTHER}`)
      .send(patchPayload({ name: 'hijacked' }));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/tenancy/);
  });

  it('returns 404 when the target item does not exist', async () => {
    mockClient([{ rowCount: 0, rows: [] }]); // SELECT household_id → no row
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(patchPayload({ name: 'ghost' }));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });

  it('returns 400 when a forbidden (immutable) column is in the PATCH', async () => {
    mockClient([]); // rejected before any meaningful query
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(patchPayload({ household_id: 'some-other-household' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not editable/);
  });

  it('returns 400 when the PATCH data is empty', async () => {
    mockClient([]);
    const res = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(patchPayload({}));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one column/);
  });

  it('is idempotent — retrying the same PATCH issues an identical UPDATE', async () => {
    const first = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const second = mockClient([ROW_FOUND, MEMBER, UPDATED]);
    const payload = patchPayload({ name: 'Whole milk', quantity: 2 });

    const res1 = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(payload);
    const res2 = await request(buildApp())
      .post('/sync/upload')
      .set('Authorization', `Bearer test:${USER}`)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const update1 = first.query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    const update2 = second.query.mock.calls.find((c) => /^UPDATE pantry_items SET/i.test(c[0] as string));
    expect(update1?.[0]).toBe(update2?.[0]);
    expect(update1?.[1]).toEqual(update2?.[1]);
  });
});
