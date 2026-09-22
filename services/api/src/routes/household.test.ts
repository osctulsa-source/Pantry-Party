// Legacy API behavior retained under the ADR-009 NestJS migration.
// pool and jose's jwtVerify are both module-mocked so this suite never
// touches a real database or JWKS endpoint.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// IMPORTANT: vi.mock calls are hoisted to the top of the file. They MUST run
// before the route module (which imports from these paths) is loaded.

vi.mock('jose', () => {
  // requireUser: any token of shape "test:<userId>" is treated as a valid JWT
  // with that sub. Anything else throws — exercises the real 401 branches in
  // the middleware. The route module never calls createRemoteJWKSet at request
  // time, only at module load; returning a no-op factory is sufficient.
  return {
    createRemoteJWKSet: () => () => null,
    jwtVerify: vi.fn(async (token: string) => {
      if (typeof token === 'string' && token.startsWith('test:')) {
        const sub = token.slice('test:'.length);
        if (!sub) throw new Error('empty sub');
        return { payload: { sub } };
      }
      throw new Error('invalid token');
    }),
  };
});

interface MockQueryResult {
  rowCount: number;
  rows: unknown[];
}

const connectMock = vi.fn();

vi.mock('../db.js', () => ({
  pool: {
    connect: (...args: unknown[]) => connectMock(...args),
  },
}));

// Route module + supertest are imported AFTER the mocks are registered.
const { default: express } = await import('express');
const { householdRouter } = await import('./household.js');
const { default: request } = await import('supertest');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(householdRouter);
  return app;
}

type QueryStep = MockQueryResult | Error;

/**
 * Wires up a single fake PoolClient that responds to the route's queries in
 * the given order. BEGIN/COMMIT/ROLLBACK statements are intercepted and
 * always succeed with an empty result — only meaningful queries consume from
 * the queue. This keeps tests focused on the SQL we actually care about.
 */
function mockClient(steps: QueryStep[]): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const queue: QueryStep[] = [...steps];
  const query = vi.fn(async (sql: string) => {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`unexpected query: ${sql}`);
    }
    if (next instanceof Error) throw next;
    return next;
  });
  const release = vi.fn();
  connectMock.mockImplementation(async () => ({ query, release }));
  return { query, release };
}

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const HOUSEHOLD_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MEMBERSHIP_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INVITE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

beforeEach(() => {
  connectMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /household/bootstrap', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(buildApp()).post('/household/bootstrap');
    expect(res.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns the oldest existing membership without inserting', async () => {
    const { query } = mockClient([
      {
        rowCount: 1,
        rows: [{ id: MEMBERSHIP_1, household_id: HOUSEHOLD_1, created_at: PAST }],
      },
    ]);
    const res = await request(buildApp())
      .post('/household/bootstrap')
      .set('Authorization', `Bearer test:${USER_A}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      created: false,
      household_id: HOUSEHOLD_1,
      membership_id: MEMBERSHIP_1,
      membership_created_at: PAST,
    });
    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => /INSERT INTO households/i.test(s))).toBe(false);
  });

  it('creates a household and owner membership when the user has none', async () => {
    const { query } = mockClient([
      { rowCount: 0, rows: [] },
      { rowCount: 1, rows: [{ id: HOUSEHOLD_1 }] },
      { rowCount: 1, rows: [{ id: MEMBERSHIP_1, created_at: PAST }] },
    ]);
    const res = await request(buildApp())
      .post('/household/bootstrap')
      .set('Authorization', `Bearer test:${USER_A}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      created: true,
      household_id: HOUSEHOLD_1,
      membership_id: MEMBERSHIP_1,
      membership_created_at: PAST,
    });
    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => /INSERT INTO households/i.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO user_households/i.test(s))).toBe(true);
    const householdInsert = query.mock.calls.find((c) => /INSERT INTO households/i.test(c[0] as string));
    expect(householdInsert?.[1]).toEqual([USER_A]);
  });
});

describe('POST /household/invite', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(buildApp())
      .post('/household/invite')
      .send({ household_id: HOUSEHOLD_1 });
    expect(res.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header is malformed', async () => {
    const res = await request(buildApp())
      .post('/household/invite')
      .set('Authorization', 'Token abc') // not "Bearer …"
      .send({ household_id: HOUSEHOLD_1 });
    expect(res.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when household_id is not a UUID', async () => {
    const res = await request(buildApp())
      .post('/household/invite')
      .set('Authorization', `Bearer test:${USER_A}`)
      .send({ household_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the signed-in user is not a member of the household', async () => {
    mockClient([{ rowCount: 0, rows: [] }]); // membership lookup → no row
    const res = await request(buildApp())
      .post('/household/invite')
      .set('Authorization', `Bearer test:${USER_A}`)
      .send({ household_id: HOUSEHOLD_1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a member/);
  });

  it('returns 200 + a well-formed code on the success path', async () => {
    const { query } = mockClient([
      // membership lookup
      { rowCount: 1, rows: [{ id: 'membership-row' }] },
      // INSERT … RETURNING
      {
        rowCount: 1,
        rows: [
          {
            id: INVITE_ID,
            household_id: HOUSEHOLD_1,
            invite_code: 'BREAD-7K2M',
            created_by: USER_A,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: FUTURE,
            used_at: null,
            used_by: null,
          },
        ],
      },
    ]);

    const res = await request(buildApp())
      .post('/household/invite')
      .set('Authorization', `Bearer test:${USER_A}`)
      .send({ household_id: HOUSEHOLD_1 });

    expect(res.status).toBe(200);
    expect(res.body.invite_code).toMatch(/^[A-Z]+-[A-Z0-9]{4}$/);
    expect(res.body.expires_at).toBe(FUTURE);

    // The route should have wrapped the work in a transaction.
    const allSql = query.mock.calls.map((c) => c[0] as string);
    expect(allSql.some((s) => /^\s*BEGIN/i.test(s))).toBe(true);
    expect(allSql.some((s) => /^\s*COMMIT/i.test(s))).toBe(true);

    // INSERT was issued with (household_id, generated_code, userId) as params.
    const insertCall = query.mock.calls.find((c) =>
      /INSERT INTO household_invites/i.test(c[0] as string),
    );
    expect(insertCall).toBeDefined();
    if (insertCall) {
      const params = insertCall[1] as unknown[];
      expect(params[0]).toBe(HOUSEHOLD_1);
      expect(params[1]).toMatch(/^[A-Z]+-[A-Z0-9]{4}$/);
      expect(params[2]).toBe(USER_A);
    }
  });

  it('retries on UNIQUE violation and eventually succeeds', async () => {
    const collision = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    mockClient([
      { rowCount: 1, rows: [{ id: 'membership-row' }] },
      collision, // first INSERT → unique violation
      {
        rowCount: 1,
        rows: [
          {
            id: INVITE_ID,
            household_id: HOUSEHOLD_1,
            invite_code: 'OLIVE-X9PL',
            created_by: USER_A,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: FUTURE,
            used_at: null,
            used_by: null,
          },
        ],
      },
    ]);

    const res = await request(buildApp())
      .post('/household/invite')
      .set('Authorization', `Bearer test:${USER_A}`)
      .send({ household_id: HOUSEHOLD_1 });

    expect(res.status).toBe(200);
    expect(res.body.invite_code).toMatch(/^[A-Z]+-[A-Z0-9]{4}$/);
  });

  it('returns 500 after exhausting retry budget', async () => {
    const collision = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    mockClient([
      { rowCount: 1, rows: [{ id: 'membership-row' }] },
      collision,
      collision,
      collision,
      collision,
      collision,
    ]);

    const res = await request(buildApp())
      .post('/household/invite')
      .set('Authorization', `Bearer test:${USER_A}`)
      .send({ household_id: HOUSEHOLD_1 });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/unique code/);
  });
});

describe('POST /household/accept', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(buildApp())
      .post('/household/accept')
      .send({ invite_code: 'BREAD-7K2M' });
    expect(res.status).toBe(401);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when invite_code is malformed', async () => {
    const res = await request(buildApp())
      .post('/household/accept')
      .set('Authorization', `Bearer test:${USER_B}`)
      .send({ invite_code: 'bread-7k2m' }); // lowercase → fails regex
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the code doesn't exist", async () => {
    mockClient([{ rowCount: 0, rows: [] }]); // SELECT … invite → none
    const res = await request(buildApp())
      .post('/household/accept')
      .set('Authorization', `Bearer test:${USER_B}`)
      .send({ invite_code: 'BREAD-7K2M' });
    expect(res.status).toBe(404);
  });

  it('returns 410 when the code is expired', async () => {
    mockClient([
      {
        rowCount: 1,
        rows: [
          {
            id: INVITE_ID,
            household_id: HOUSEHOLD_1,
            invite_code: 'BREAD-7K2M',
            created_by: USER_A,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: PAST,
            used_at: null,
            used_by: null,
          },
        ],
      },
    ]);
    const res = await request(buildApp())
      .post('/household/accept')
      .set('Authorization', `Bearer test:${USER_B}`)
      .send({ invite_code: 'BREAD-7K2M' });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/expired/);
  });

  it('returns 409 when the code is already used', async () => {
    mockClient([
      {
        rowCount: 1,
        rows: [
          {
            id: INVITE_ID,
            household_id: HOUSEHOLD_1,
            invite_code: 'BREAD-7K2M',
            created_by: USER_A,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: FUTURE,
            used_at: '2026-01-02T00:00:00.000Z',
            used_by: USER_B,
          },
        ],
      },
    ]);
    const res = await request(buildApp())
      .post('/household/accept')
      .set('Authorization', `Bearer test:${USER_B}`)
      .send({ invite_code: 'BREAD-7K2M' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already used/);
  });

  it('returns 409 when the user is already a member of the target household', async () => {
    mockClient([
      // SELECT … invite
      {
        rowCount: 1,
        rows: [
          {
            id: INVITE_ID,
            household_id: HOUSEHOLD_1,
            invite_code: 'BREAD-7K2M',
            created_by: USER_A,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: FUTURE,
            used_at: null,
            used_by: null,
          },
        ],
      },
      // membership pre-check returns a row → already a member
      { rowCount: 1, rows: [{ id: 'pre-existing-membership' }] },
    ]);
    const res = await request(buildApp())
      .post('/household/accept')
      .set('Authorization', `Bearer test:${USER_B}`)
      .send({ invite_code: 'BREAD-7K2M' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already a member/);
  });

  it('returns 200 and inserts membership + marks invite used on success', async () => {
    const { query } = mockClient([
      // SELECT … invite
      {
        rowCount: 1,
        rows: [
          {
            id: INVITE_ID,
            household_id: HOUSEHOLD_1,
            invite_code: 'BREAD-7K2M',
            created_by: USER_A,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: FUTURE,
            used_at: null,
            used_by: null,
          },
        ],
      },
      // membership pre-check → no row
      { rowCount: 0, rows: [] },
      // INSERT user_households
      { rowCount: 1, rows: [] },
      // UPDATE household_invites … RETURNING
      { rowCount: 1, rows: [] },
    ]);

    const res = await request(buildApp())
      .post('/household/accept')
      .set('Authorization', `Bearer test:${USER_B}`)
      .send({ invite_code: 'BREAD-7K2M' });

    expect(res.status).toBe(200);
    expect(res.body.household_id).toBe(HOUSEHOLD_1);

    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => /INSERT INTO user_households/i.test(s))).toBe(true);
    expect(sqls.some((s) => /UPDATE household_invites/i.test(s))).toBe(true);
    expect(sqls.some((s) => /^\s*BEGIN/i.test(s))).toBe(true);
    expect(sqls.some((s) => /^\s*COMMIT/i.test(s))).toBe(true);

    // INSERT params: (userId, household_id) — role is a literal in the SQL.
    const insertCall = query.mock.calls.find((c) =>
      /INSERT INTO user_households/i.test(c[0] as string),
    );
    if (insertCall) {
      const params = insertCall[1] as unknown[];
      expect(params[0]).toBe(USER_B);
      expect(params[1]).toBe(HOUSEHOLD_1);
    }

    // UPDATE params: (used_by = userId, invite.id)
    const updateCall = query.mock.calls.find((c) =>
      /UPDATE household_invites/i.test(c[0] as string),
    );
    if (updateCall) {
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe(USER_B);
      expect(params[1]).toBe(INVITE_ID);
    }
  });
});
