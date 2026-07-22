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
