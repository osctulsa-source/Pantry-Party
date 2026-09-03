// Real-Postgres integration test for DELETE /account — the store-gate cascade.
//
// This is the regression proof for P0-#1: the previous cascade ran
//   UPDATE household_invites SET used_at = NOW(), used_by = 'deleted' ...
// and `used_by` is a UUID column, so the 'deleted' literal failed uuid coercion
// at query-parse time and 500'd EVERY call. The mocked unit suite couldn't see
// it because the driver never parsed the SQL. Here real Postgres does.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

// The controller's Supabase admin-delete is a separate HTTP call; with no
// SUPABASE_URL set it's skipped, but stub fetch defensively so a stray env var
// can't make the suite hit the network.
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })));

const { makeTestPool, truncateAll, seedHousehold, seedMembership, bearer } = await import(
  './helpers/schema.js'
);
const { buildAccountApp } = await import('./helpers/app.js');
const { default: request } = await import('supertest');

const pool = makeTestPool();
const app = await buildAccountApp();

const USER_A = '00000000-0000-0000-0000-0000000000a1';
const USER_B = '00000000-0000-0000-0000-0000000000b2';
const HH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeAll(async () => {
  // Fail fast with a clear message if the DB isn't reachable.
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /account (real Postgres)', () => {
  it('completes the full cascade end-to-end (P0-#1 regression: invite revoke does not 500)', async () => {
    // Household owned by A, with B as a longer-lived... no — A is owner, B is a
    // co-member who should inherit ownership.
    await seedHousehold(pool, { id: HH, name: 'Shared', createdBy: USER_A });
    await seedMembership(pool, { userId: USER_A, householdId: HH, role: 'owner' });
    await seedMembership(pool, { userId: USER_B, householdId: HH, role: 'member' });

    // A's pantry + shopping items, and an outstanding invite A created.
    await pool.query(
      `INSERT INTO pantry_items (id, household_id, name, added_at, source, added_by, updated_at, deleted)
       VALUES (gen_random_uuid(), $1, 'Eggs', NOW(), 'manual', $2, $3, false)`,
      [HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO shopping_list_items (id, household_id, name, added_at, source, added_by, updated_at, deleted)
       VALUES (gen_random_uuid(), $1, 'Milk', NOW(), 'manual', $2, $3, false)`,
      [HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO household_invites (id, household_id, invite_code, created_by)
       VALUES (gen_random_uuid(), $1, 'ABC123', $2)`,
      [HH, USER_A],
    );

    // Attribution rows across the remaining household tables + a push token.
    await pool.query(
      `INSERT INTO favorite_recipes (id, household_id, recipe_id, title, payload, added_by, added_at, updated_at)
       VALUES (gen_random_uuid(), $1, 1, 'Soup', '{}', $2, NOW(), $3)`,
      [HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO activity_events (id, household_id, kind, label, occurred_at, added_by, updated_at)
       VALUES (gen_random_uuid(), $1, 'cooked', 'Soup', NOW(), $2, $3)`,
      [HH, USER_A, Date.now()],
    );
    const ann = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await pool.query(
      `INSERT INTO announcements (id, household_id, kind, created_by, created_at, updated_at)
       VALUES ($1, $2, 'runner', $3, NOW(), $4)`,
      [ann, HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO announcement_reactions (id, announcement_id, household_id, user_id, reaction, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '👍', NOW(), $4)`,
      [ann, HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO push_tokens (id, user_id, token, platform, updated_at)
       VALUES (gen_random_uuid(), $1, 'ExponentPushToken[x]', 'ios', $2)`,
      [USER_A, Date.now()],
    );

    const res = await request(app).delete('/account').set('Authorization', bearer(USER_A));

    // The whole point of P0-#1: this used to be a 500.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: USER_A });

    // Pantry + shopping items tombstoned.
    const pantry = await pool.query(
      'SELECT deleted FROM pantry_items WHERE added_by = $1',
      [USER_A],
    );
    expect(pantry.rows.every((r) => r.deleted === true)).toBe(true);
    const shopping = await pool.query(
      'SELECT deleted FROM shopping_list_items WHERE added_by = $1',
      [USER_A],
    );
    expect(shopping.rows.every((r) => r.deleted === true)).toBe(true);

    // Invite revoked — used_at set, used_by still NULL (no bogus sentinel).
    const invite = await pool.query(
      'SELECT used_at, used_by FROM household_invites WHERE created_by = $1',
      [USER_A],
    );
    expect(invite.rows[0].used_at).not.toBeNull();
    expect(invite.rows[0].used_by).toBeNull();

    // A's membership removed; ownership transferred to B.
    const aMembership = await pool.query(
      'SELECT 1 FROM user_households WHERE user_id = $1',
      [USER_A],
    );
    expect(aMembership.rowCount).toBe(0);
    const bRole = await pool.query(
      'SELECT role FROM user_households WHERE user_id = $1 AND household_id = $2',
      [USER_B, HH],
    );
    expect(bRole.rows[0].role).toBe('owner');

    // No live row still attributes content to the deleted user, and no live
    // push token remains (deleted devices stop receiving household pushes).
    for (const [table, col] of [
      ['favorite_recipes', 'added_by'],
      ['activity_events', 'added_by'],
      ['announcements', 'created_by'],
      ['announcement_reactions', 'user_id'],
      ['push_tokens', 'user_id'],
    ] as const) {
      const live = await pool.query(
        `SELECT 1 FROM ${table} WHERE ${col} = $1 AND deleted = false`,
        [USER_A],
      );
      expect(live.rowCount, `${table} should have no live rows for a deleted user`).toBe(0);
    }
  });

  it('is idempotent — deleting an already-deleted user still returns 200', async () => {
    const res = await request(app).delete('/account').set('Authorization', bearer(USER_A));
    expect(res.status).toBe(200);
  });
});
