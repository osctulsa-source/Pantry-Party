// Real-Postgres integration test for POST /household/accept — the invite flow
// that the sync-path user_households PUT is deliberately NOT allowed to
// substitute for (see upload.integration.test.ts). Exercises the real
// used_by = $1 UUID write that the account cascade's revoke mirrors.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => null,
  jwtVerify: vi.fn(async (token: string) => {
    if (typeof token === 'string' && token.startsWith('test:')) {
      const sub = token.slice('test:'.length);
      if (!sub) throw new Error('empty sub');
      return { payload: { sub, aud: 'authenticated' } };
    }
    throw new Error('invalid token');
  }),
}));

const { makeTestPool, truncateAll, seedHouseholdWithOwner, bearer } = await import(
  './helpers/schema.js'
);
const { buildHouseholdApp } = await import('./helpers/app.js');
const { default: request } = await import('supertest');

const pool = makeTestPool();
const app = await buildHouseholdApp();

const OWNER = '00000000-0000-0000-0000-0000000000a1';
const JOINER = '00000000-0000-0000-0000-0000000000c3';
const HH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CODE = 'BREAD-7K2M';

beforeAll(async () => {
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  await seedHouseholdWithOwner(pool, { householdId: HH, ownerId: OWNER });
  await pool.query(
    `INSERT INTO household_invites (id, household_id, invite_code, created_by)
     VALUES (gen_random_uuid(), $1, $2, $3)`,
    [HH, CODE, OWNER],
  );
});

describe('POST /household/accept (real Postgres)', () => {
  it('adds the caller as a member and marks the invite used (used_by = caller uuid)', async () => {
    const res = await request(app)
      .post('/household/accept')
      .set('Authorization', bearer(JOINER))
      .send({ invite_code: CODE });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ household_id: HH });

    const membership = await pool.query(
      'SELECT role FROM user_households WHERE user_id = $1 AND household_id = $2',
      [JOINER, HH],
    );
    expect(membership.rows[0].role).toBe('member');

    const invite = await pool.query(
      'SELECT used_at, used_by FROM household_invites WHERE invite_code = $1',
      [CODE],
    );
    expect(invite.rows[0].used_at).not.toBeNull();
    expect(invite.rows[0].used_by).toBe(JOINER);
  });

  it('rejects re-use of a spent invite with 409', async () => {
    await request(app).post('/household/accept').set('Authorization', bearer(JOINER)).send({ invite_code: CODE });
    const second = await request(app)
      .post('/household/accept')
      .set('Authorization', bearer('00000000-0000-0000-0000-0000000000d4'))
      .send({ invite_code: CODE });
    expect(second.status).toBe(409);
  });
});

describe('POST /household/bootstrap (real Postgres)', () => {
  const NEWCOMER = '00000000-0000-0000-0000-0000000000d4';

  it('returns a joined member their existing household without touching ownership', async () => {
    await pool.query(
      "INSERT INTO user_households (id, user_id, household_id, role) VALUES (gen_random_uuid(), $1, $2, 'member')",
      [JOINER, HH],
    );
    const res = await request(app).post('/household/bootstrap').set('Authorization', bearer(JOINER));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: false, household_id: HH });
    const hh = await pool.query('SELECT created_by FROM households WHERE id = $1', [HH]);
    expect(hh.rows[0]?.created_by).toBe(OWNER);
    const m = await pool.query('SELECT role FROM user_households WHERE user_id = $1', [JOINER]);
    expect(m.rows).toEqual([{ role: 'member' }]);
  });

  it('concurrent bootstraps for a new user create exactly one household', async () => {
    // Widen the SELECT→INSERT race window so it's hit deterministically: each
    // household insert sleeps, so without serialization every request reads
    // "no membership" before any of them commits.
    await pool.query(`
      CREATE OR REPLACE FUNCTION test_slow_household_insert() RETURNS trigger AS $$
      BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$ LANGUAGE plpgsql`);
    await pool.query(
      'CREATE TRIGGER test_slow_household BEFORE INSERT ON households FOR EACH ROW EXECUTE FUNCTION test_slow_household_insert()',
    );
    let results;
    try {
      results = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app).post('/household/bootstrap').set('Authorization', bearer(NEWCOMER)),
        ),
      );
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS test_slow_household ON households');
      await pool.query('DROP FUNCTION IF EXISTS test_slow_household_insert()');
    }
    for (const r of results) expect(r.status).toBe(200);
    expect(new Set(results.map((r) => r.body.household_id)).size).toBe(1);
    expect(results.filter((r) => r.body.created === true)).toHaveLength(1);
    const owned = await pool.query('SELECT count(*)::int AS n FROM households WHERE created_by = $1', [NEWCOMER]);
    expect(owned.rows[0]?.n).toBe(1);
  });
});
